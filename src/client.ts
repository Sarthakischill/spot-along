#!/usr/bin/env node

import WebSocket from 'ws';
import * as readline from 'readline';
import dotenv from 'dotenv';
import chalk from 'chalk';
import { getAuthenticatedApi, resetConfig } from './tokenManager';
import { WebSocketMessage, PlaybackStatePayload, RoomStatePayload } from './types';
import * as UIManager from './uiManager';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { version } = require('../package.json');

dotenv.config({ quiet: true });

const BASE_SERVER_ADDRESS = 'spot-along-server.sarthakshitole.workers.dev';

let currentMode = 'menu';
let ws: WebSocket | null = null;
let spotifyApi: any;
let isHost = false;
let hostPollingInterval: NodeJS.Timeout | null = null;
let isConnecting = false;
let connectionTimeout: NodeJS.Timeout | null = null;

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const keypressHandler = async (str: string, key: any) => {
    if (key.ctrl && key.name === 'c') {
        cleanup();
        process.exit();
    }
    if (isConnecting || currentMode === 'prompt') return;
    if (currentMode === 'menu') {
        switch (key.name) {
            case 'c': if (!isConnecting) await connectToRoom('create'); return;
            case 'j':
                if (!isConnecting) {
                    const roomId = await promptForRoomId();
                    if (roomId) await connectToRoom('join', roomId);
                    UIManager.render();
                }
                return;
            case 'h': currentMode = 'help'; UIManager.setMode('help'); break;
            case 'q': cleanup(); process.exit();
        }
    } else if (currentMode === 'in-room') {
        if (key.name === 'q') leaveRoom();
    } else if (currentMode === 'help') {
        if (key.name === 'b') { currentMode = 'menu'; UIManager.setMode('menu'); }
        if (key.name === 'r') {
            await resetConfig();
            UIManager.showNotification('Configuration Reset! Please restart.', 2000);
            setTimeout(() => process.exit(), 2000);
            return;
        }
    }
    UIManager.render();
};

async function connectToRoom(action: 'create' | 'join', roomId?: string) {
    if (isConnecting) {
        UIManager.showNotification('Already connecting...', 2000);
        UIManager.render();
        return;
    }
    isConnecting = true;
    const path = action === 'create' ? 'create' : `join/${roomId}`;
    const fullAddress = `wss://${BASE_SERVER_ADDRESS}/room/${path}`;
    cleanup();
    try {
        await spotifyApi.getMe();
    } catch (error) {
        try {
            const data = await spotifyApi.refreshAccessToken();
            spotifyApi.setAccessToken(data.body['access_token']);
            await spotifyApi.getMe();
        } catch (refreshError) {
            isConnecting = false;
            UIManager.showNotification('Authentication expired. Please restart the app.', 5000);
            UIManager.render();
            return;
        }
    }
    UIManager.showNotification(`${action === 'create' ? 'Creating room' : 'Joining room'}...`, 30000);
    UIManager.render();
    connectionTimeout = setTimeout(() => {
        if (ws) ws.terminate();
        isConnecting = false;
        UIManager.showNotification('Connection timed out. Server may be unavailable.', 5000);
        UIManager.render();
    }, 10000);
    try {
        ws = new WebSocket(fullAddress);
        ws.on('open', () => {
            if (connectionTimeout) { clearTimeout(connectionTimeout); connectionTimeout = null; }
            try {
                const token = spotifyApi.getAccessToken();
                if (!token) { handleConnectionError('Auth token is missing.'); return; }
                const type = action === 'create' ? 'create-room' : 'join-room';
                ws!.send(JSON.stringify({ type, payload: { accessToken: token } }));
            } catch (error) {
                handleConnectionError('Failed to send connection message.');
            }
        });
        ws.on('message', (data: any) => {
            try {
                const message: WebSocketMessage = JSON.parse(data.toString());
                handleWebSocketMessage(message);
            } catch (error) {
                handleConnectionError('Invalid message from server.');
            }
        });
        ws.on('close', (code, reason) => handleConnectionClose(code, reason?.toString()));
        ws.on('error', (err) => handleConnectionError(`Connection failed: ${err.message}`));
    } catch (error) {
        isConnecting = false;
        if (connectionTimeout) { clearTimeout(connectionTimeout); connectionTimeout = null; }
        UIManager.showNotification('Failed to create connection.', 5000);
        UIManager.render();
    }
}

function handleWebSocketMessage(message: WebSocketMessage) {
    switch (message.type) {
        case 'room-created':
            isConnecting = false; isHost = true; currentMode = 'in-room';
            UIManager.setRoom(message.payload.roomId); UIManager.setMode('in-room');
            startHostPolling();
            UIManager.showNotification(`Room ${message.payload.roomId} created!`, 6000);
            break;
        case 'joined-room':
            isConnecting = false; isHost = false; currentMode = 'in-room';
            UIManager.setRoom(message.payload.roomId); UIManager.setMode('in-room');
            UIManager.showNotification(`Joined room ${message.payload.roomId}!`, 4000);
            break;
        case 'room-state-update': UIManager.setRoomState(message.payload); break;
        case 'force-sync': if (!isHost) syncToHostPlayback(message.payload); break;
        case 'error': isConnecting = false; UIManager.showNotification(message.payload.message, 5000); leaveRoom(); break;
    }
    UIManager.render();
}

function handleConnectionError(errorMessage: string) {
    isConnecting = false;
    if (connectionTimeout) { clearTimeout(connectionTimeout); connectionTimeout = null; }
    cleanup();
    currentMode = 'menu'; UIManager.setMode('menu');
    UIManager.showNotification(errorMessage, 5000);
    UIManager.render();
}

function handleConnectionClose(code: number, reason?: string) {
    isConnecting = false;
    if (connectionTimeout) { clearTimeout(connectionTimeout); connectionTimeout = null; }
    if (currentMode === 'menu') return;
    cleanup();
    currentMode = 'menu'; UIManager.setMode('menu');
    if (code !== 1000) UIManager.showNotification('Connection lost.', 4000);
    UIManager.render();
}

async function syncToHostPlayback(state: PlaybackStatePayload) {
    try {
        UIManager.setPlaybackState(state);
        if (state.isPlaying) {
            await spotifyApi.play({ uris: [state.trackUri], position_ms: state.positionMs });
        } else {
            await spotifyApi.pause();
        }
    } catch (error: any) {
        if (error.message.includes('401')) {
            try {
                const data = await spotifyApi.refreshAccessToken();
                spotifyApi.setAccessToken(data.body['access_token']);
                await syncToHostPlayback(state); // Retry
            } catch (refreshError) { /* Silent fail */ }
        }
    }
}

function leaveRoom() {
    cleanup();
    currentMode = 'menu'; UIManager.setMode('menu');
    UIManager.showNotification('Left room.', 2000);
    UIManager.render();
    if (ws) ws.close(1000, 'User left room');
}

function cleanup() {
    if (ws) { ws.terminate(); ws = null; }
    if (hostPollingInterval) { clearInterval(hostPollingInterval); hostPollingInterval = null; }
    if (connectionTimeout) { clearTimeout(connectionTimeout); connectionTimeout = null; }
    isHost = false; isConnecting = false;
}

function promptForRoomId(): Promise<string | null> {
    return new Promise((resolve) => {
        currentMode = 'prompt';
        UIManager.setMode('prompt');

        // --- THE FIX IS HERE ---
        // 1. Temporarily remove the global keypress listener.
        process.stdin.removeListener('keypress', keypressHandler);

        if (process.stdin.isTTY) {
            process.stdin.setRawMode(false);
        }

        process.stdout.write('\x1B[2J\x1B[0f');
        console.log(chalk.bold.magenta('🎵 SpotAlong') + chalk.gray(' - Join Room'));
        console.log('');

        const promptRl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });

        promptRl.question(chalk.cyanBright('Enter Room ID (or Enter to cancel): '), (input) => {
            promptRl.close();

            if (process.stdin.isTTY) {
                process.stdin.setRawMode(true);
            }

            // --- THE FIX IS HERE ---
            // 2. Re-attach the global keypress listener so the menu works again.
            process.stdin.on('keypress', keypressHandler);

            currentMode = 'menu';
            UIManager.setMode('menu');

            const roomId = input ? input.trim().toUpperCase() : null;
            if (!roomId) {
                UIManager.showNotification('Join cancelled.', 2000);
            }
            resolve(roomId);
        });
    });
}

const startHostPolling = () => {
    if (hostPollingInterval) clearInterval(hostPollingInterval);
    let lastStateHash = ''; let consecutiveErrors = 0;
    hostPollingInterval = setInterval(async () => {
        if (!isHost || !ws || ws.readyState !== WebSocket.OPEN) {
            if (hostPollingInterval) clearInterval(hostPollingInterval);
            return;
        }
        try {
            const state = await spotifyApi.getMyCurrentPlaybackState();
            let currentState: PlaybackStatePayload | null = null;
            if (state.body && state.body.item && 'artists' in state.body.item) {
                currentState = {
                    trackName: state.body.item.name,
                    artistName: state.body.item.artists.map((a: any) => a.name).join(', '),
                    trackUri: state.body.item.uri,
                    durationMs: state.body.item.duration_ms,
                    positionMs: state.body.progress_ms || 0,
                    isPlaying: state.body.is_playing,
                    timestamp: Date.now(),
                };
            } else if (UIManager.getPlaybackState()) {
                currentState = { ...UIManager.getPlaybackState()!, isPlaying: false };
            }
            if (currentState) UIManager.setPlaybackState(currentState);
            const stateHash = currentState ? `${currentState.trackUri}-${currentState.isPlaying}-${Math.floor(currentState.positionMs / 5000)}` : 'null';
            if (stateHash !== lastStateHash) {
                lastStateHash = stateHash;
                if (ws && ws.readyState === WebSocket.OPEN && currentState) {
                    ws.send(JSON.stringify({ type: 'playback-state-update', payload: { ...currentState, accessToken: spotifyApi.getAccessToken() } }));
                }
            }
            if (currentMode === 'in-room') UIManager.render();
            consecutiveErrors = 0;
        } catch (error: any) {
            consecutiveErrors++;
            if (error.message.includes('401')) {
                try {
                    const data = await spotifyApi.refreshAccessToken();
                    if (data.body['access_token']) { spotifyApi.setAccessToken(data.body['access_token']); consecutiveErrors = 0; }
                } catch (refreshError) {
                    if (consecutiveErrors > 3) { UIManager.showNotification('Auth expired. Please restart.', 5000); leaveRoom(); }
                }
            } else if (consecutiveErrors > 10) { UIManager.showNotification('Connection issues. Please restart.', 5000); leaveRoom(); }
        }
    }, 2000);
};

async function main() {
    try {
        console.log(`--- EXECUTING SPOTALONG VERSION ${version} ---`);
        spotifyApi = await getAuthenticatedApi();
        const me = await spotifyApi.getMe();
        UIManager.setMe({ id: me.body.id, username: me.body.display_name || 'User' });

        readline.emitKeypressEvents(process.stdin);
        if (process.stdin.isTTY) {
            process.stdin.setRawMode(true);
        }
        process.stdin.on('keypress', keypressHandler);

        process.on('exit', () => {
            cleanup();
            console.log(`\n\n${chalk.bold.magenta('Happy Listening!')}\n`);
            process.stdout.write('\x1B[?25h');
        });
        const gracefulShutdown = () => { cleanup(); process.exit(); };
        process.on('SIGINT', gracefulShutdown);
        process.on('SIGTERM', gracefulShutdown);
        UIManager.render();
    } catch (error: any) {
        // Final, Production-Ready Catch Block
        console.error(chalk.red('\n🛑 Application failed to start:'));

        if (error.statusCode === 403) {
            console.error(chalk.yellow('Authentication succeeded, but Spotify blocked access (403 Forbidden).'));
            console.error(chalk.cyan('This usually means the app is in "Development Mode" and your Spotify account has not been added to the allowed users list.'));
            console.error(chalk.cyan('Please contact the developer and ask them to add your Spotify email to "Users and Access" in their Spotify Developer Dashboard.'));

        } else if (error.name === 'WebApiError' && error.body && error.body.error) {
            const spotifyError = error.body.error;
            const statusCode = error.statusCode || 'N/A';
            const errorMessage = spotifyError.message || 'An unknown Spotify API error occurred.';
            console.error(chalk.yellow(`Spotify API Error (Status: ${statusCode}): ${errorMessage}`));

        } else if (error instanceof Error) {
            console.error(chalk.yellow(error.message));

        } else {
            console.error(chalk.yellow('An unexpected error occurred:'), error);
        }

        process.exit(1);
    }
}

main();