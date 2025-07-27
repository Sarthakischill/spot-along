#!/usr/bin/env node

import WebSocket from 'ws';
import * as readline from 'readline';
import dotenv from 'dotenv';
import chalk from 'chalk';
import { getAuthenticatedApi, resetConfig } from './tokenManager';
import { WebSocketMessage, PlaybackStatePayload, RoomStatePayload } from './types';
import * as UIManager from './uiManager';

dotenv.config({ quiet: true });

const BASE_SERVER_ADDRESS = 'spot-along-server.sarthakshitole.workers.dev';

let currentMode = 'menu';
let ws: WebSocket | null = null;
let spotifyApi: any;
let isHost = false;
let hostPollingInterval: NodeJS.Timeout | null = null;

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

// FIX: This is the main keypress handler. We will detach and reattach it as needed.
const keypressHandler = async (str: string, key: any) => {
    if (key.ctrl && key.name === 'c') process.exit();

    if (currentMode === 'menu') {
        switch (key.name) {
            case 'c':
                connectToRoom('create');
                return; // FIX: Prevent final render call
            case 'j':
                const roomId = await promptForRoomId();
                if (roomId) {
                    connectToRoom('join', roomId);
                }
                // After prompt, re-render the menu
                UIManager.render();
                return;
            case 'h':
                currentMode = 'help';
                UIManager.setMode('help');
                break;
            case 'q':
                process.exit();
        }
    } else if (currentMode === 'in-room') {
        if (key.name === 'q') {
            ws?.close();
        }
    } else if (currentMode === 'help') {
        if (key.name === 'b') {
            currentMode = 'menu';
            UIManager.setMode('menu');
        }
        if (key.name === 'r') {
            await resetConfig();
            UIManager.showNotification('Configuration Reset! Please restart.', 2000);
            setTimeout(() => process.exit(), 2000);
        }
    }
    UIManager.render();
};

async function connectToRoom(action: 'create' | 'join', roomId?: string) {
    const path = action === 'create' ? 'create' : `join/${roomId}`;
    const fullAddress = `wss://${BASE_SERVER_ADDRESS}/room/${path}`;

    if (ws) ws.terminate();
    if (hostPollingInterval) clearInterval(hostPollingInterval);
    isHost = false;

    UIManager.showNotification(`Connecting...`, 10000);
    ws = new WebSocket(fullAddress);

    ws.on('open', () => {
        const type = action === 'create' ? 'create-room' : 'join-room';
        ws!.send(JSON.stringify({ type, payload: { accessToken: spotifyApi.getAccessToken() } }));
    });

    ws.on('message', (data: any) => {
        const message: WebSocketMessage = JSON.parse(data.toString());
        switch (message.type) {
            case 'room-created':
                isHost = true;
                currentMode = 'in-room';
                UIManager.setRoom(message.payload.roomId);
                UIManager.setMode('in-room');
                startHostPolling();
                UIManager.showNotification(`Room ${message.payload.roomId} created!`, 4000);
                break;
            case 'joined-room':
                isHost = false;
                currentMode = 'in-room';
                UIManager.setRoom(message.payload.roomId);
                UIManager.setMode('in-room');
                UIManager.showNotification(`Joined room ${message.payload.roomId}.`, 4000);
                break;
            case 'room-state-update':
                UIManager.setRoomState(message.payload);
                break;
            case 'force-sync':
                if (!isHost) {
                    const state: PlaybackStatePayload = message.payload;
                    UIManager.setPlaybackState(state);
                    if (state.isPlaying) spotifyApi.play({ uris: [state.trackUri], position_ms: state.positionMs }).catch(() => {});
                    else spotifyApi.pause().catch(() => {});
                }
                break;
            case 'error':
                UIManager.showNotification(`Error: ${message.payload.message}`, 5000);
                ws?.close();
                break;
        }
        UIManager.render();
    });

    ws.on('close', () => {
        if (hostPollingInterval) clearInterval(hostPollingInterval);
        isHost = false;
        currentMode = 'menu';
        UIManager.setMode('menu');
        UIManager.showNotification('Disconnected.', 3000);
        UIManager.render();
    });

    ws.on('error', (err) => {
        UIManager.showNotification(`Connection failed: ${err.message}`, 5000);
        ws?.close();
    });
}

// FIX: New, isolated function for prompting to prevent input bleed.
function promptForRoomId(): Promise<string | null> {
    return new Promise((resolve) => {
        currentMode = 'prompt';
        UIManager.setMode('prompt'); // Tell UI manager to stop rendering
        process.stdin.off('keypress', keypressHandler); // Detach main listener
        if (process.stdin.isTTY) process.stdin.setRawMode(false); // Turn off raw mode

        rl.question(chalk.cyanBright('Enter Room ID to join: '), (roomId) => {
            if (process.stdin.isTTY) process.stdin.setRawMode(true); // Turn raw mode back on
            process.stdin.on('keypress', keypressHandler); // Re-attach listener
            currentMode = 'menu';
            UIManager.setMode('menu');
            resolve(roomId ? roomId.trim().toUpperCase() : null);
        });
    });
}

const startHostPolling = () => {
    if (hostPollingInterval) clearInterval(hostPollingInterval);
    
    hostPollingInterval = setInterval(async () => {
        if (!isHost) {
            if(hostPollingInterval) clearInterval(hostPollingInterval);
            return;
        }
        try {
            const state = await spotifyApi.getMyCurrentPlaybackState();
            if (state.body && state.body.item && 'artists' in state.body.item) {
                const currentState: PlaybackStatePayload = {
                    trackName: state.body.item.name,
                    artistName: state.body.item.artists.map((a: any) => a.name).join(', '),
                    trackUri: state.body.item.uri,
                    durationMs: state.body.item.duration_ms,
                    positionMs: state.body.progress_ms || 0,
                    isPlaying: state.body.is_playing,
                    timestamp: Date.now(),
                };
                UIManager.setPlaybackState(currentState);
                // Send the host's state to the server
                ws!.send(JSON.stringify({ type: 'playback-state-update', payload: currentState }));
            } else {
                // If nothing is playing, send a "paused" state
                const lastState = UIManager.getPlaybackState();
                if (lastState && lastState.isPlaying) {
                    const pausedState = { ...lastState, isPlaying: false };
                    UIManager.setPlaybackState(pausedState);
                    ws!.send(JSON.stringify({ type: 'playback-state-update', payload: pausedState }));
                } else {
                   UIManager.setPlaybackState(null);
                }
            }
            UIManager.render();
        } catch (e) {
            // Could be a token error, etc.
        }
    }, 2000); // Poll every 2 seconds
};

async function main() {
    try {
        spotifyApi = await getAuthenticatedApi();
        const me = await spotifyApi.getMe();
        UIManager.setMe({id: me.body.id, username: me.body.display_name || 'User'});
        
        readline.emitKeypressEvents(process.stdin);
        if (process.stdin.isTTY) process.stdin.setRawMode(true);
        
        // Attach the handler for the first time
        process.stdin.on('keypress', keypressHandler);

        process.on('exit', () => { 
            console.log(`\n\n${chalk.bold.magenta('Happy Listening!')}\n`); 
            process.stdout.write('\x1B[?25h'); 
        });
        UIManager.render();
    } catch (error) {
        if (error instanceof Error) {
            console.error(chalk.red('\n🛑 Application failed to start:'), chalk.yellow(error.message));
        } else {
            console.error(chalk.red('\n🛑 An unknown error occurred.'), error);
        }
        process.exit(1);
    }
}

main(); 