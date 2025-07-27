#!/usr/bin/env node
"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const ws_1 = __importDefault(require("ws"));
const readline = __importStar(require("readline"));
const dotenv_1 = __importDefault(require("dotenv"));
const chalk_1 = __importDefault(require("chalk"));
const tokenManager_1 = require("./tokenManager");
const UIManager = __importStar(require("./uiManager"));
dotenv_1.default.config({ quiet: true });
const BASE_SERVER_ADDRESS = 'spot-along-server.sarthakshitole.workers.dev';
let currentMode = 'menu';
let ws = null;
let spotifyApi;
let isHost = false;
let hostPollingInterval = null;
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});
// FIX: This is the main keypress handler. We will detach and reattach it as needed.
const keypressHandler = (str, key) => __awaiter(void 0, void 0, void 0, function* () {
    if (key.ctrl && key.name === 'c')
        process.exit();
    if (currentMode === 'menu') {
        switch (key.name) {
            case 'c':
                connectToRoom('create');
                return; // FIX: Prevent final render call
            case 'j':
                const roomId = yield promptForRoomId();
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
    }
    else if (currentMode === 'in-room') {
        if (key.name === 'q') {
            ws === null || ws === void 0 ? void 0 : ws.close();
        }
    }
    else if (currentMode === 'help') {
        if (key.name === 'b') {
            currentMode = 'menu';
            UIManager.setMode('menu');
        }
        if (key.name === 'r') {
            yield (0, tokenManager_1.resetConfig)();
            UIManager.showNotification('Configuration Reset! Please restart.', 2000);
            setTimeout(() => process.exit(), 2000);
        }
    }
    UIManager.render();
});
function connectToRoom(action, roomId) {
    return __awaiter(this, void 0, void 0, function* () {
        const path = action === 'create' ? 'create' : `join/${roomId}`;
        const fullAddress = `wss://${BASE_SERVER_ADDRESS}/room/${path}`;
        if (ws)
            ws.terminate();
        if (hostPollingInterval)
            clearInterval(hostPollingInterval);
        isHost = false;
        UIManager.showNotification(`Connecting...`, 10000);
        ws = new ws_1.default(fullAddress);
        ws.on('open', () => {
            const type = action === 'create' ? 'create-room' : 'join-room';
            ws.send(JSON.stringify({ type, payload: { accessToken: spotifyApi.getAccessToken() } }));
        });
        ws.on('message', (data) => {
            const message = JSON.parse(data.toString());
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
                        const state = message.payload;
                        UIManager.setPlaybackState(state);
                        if (state.isPlaying)
                            spotifyApi.play({ uris: [state.trackUri], position_ms: state.positionMs }).catch(() => { });
                        else
                            spotifyApi.pause().catch(() => { });
                    }
                    break;
                case 'error':
                    UIManager.showNotification(`Error: ${message.payload.message}`, 5000);
                    ws === null || ws === void 0 ? void 0 : ws.close();
                    break;
            }
            UIManager.render();
        });
        ws.on('close', () => {
            if (hostPollingInterval)
                clearInterval(hostPollingInterval);
            isHost = false;
            currentMode = 'menu';
            UIManager.setMode('menu');
            UIManager.showNotification('Disconnected.', 3000);
            UIManager.render();
        });
        ws.on('error', (err) => {
            UIManager.showNotification(`Connection failed: ${err.message}`, 5000);
            ws === null || ws === void 0 ? void 0 : ws.close();
        });
    });
}
// FIX: New, isolated function for prompting to prevent input bleed.
function promptForRoomId() {
    return new Promise((resolve) => {
        currentMode = 'prompt';
        UIManager.setMode('prompt'); // Tell UI manager to stop rendering
        process.stdin.off('keypress', keypressHandler); // Detach main listener
        if (process.stdin.isTTY)
            process.stdin.setRawMode(false); // Turn off raw mode
        rl.question(chalk_1.default.cyanBright('Enter Room ID to join: '), (roomId) => {
            if (process.stdin.isTTY)
                process.stdin.setRawMode(true); // Turn raw mode back on
            process.stdin.on('keypress', keypressHandler); // Re-attach listener
            currentMode = 'menu';
            UIManager.setMode('menu');
            resolve(roomId ? roomId.trim().toUpperCase() : null);
        });
    });
}
const startHostPolling = () => {
    if (hostPollingInterval)
        clearInterval(hostPollingInterval);
    hostPollingInterval = setInterval(() => __awaiter(void 0, void 0, void 0, function* () {
        if (!isHost) {
            if (hostPollingInterval)
                clearInterval(hostPollingInterval);
            return;
        }
        try {
            const state = yield spotifyApi.getMyCurrentPlaybackState();
            if (state.body && state.body.item && 'artists' in state.body.item) {
                const currentState = {
                    trackName: state.body.item.name,
                    artistName: state.body.item.artists.map((a) => a.name).join(', '),
                    trackUri: state.body.item.uri,
                    durationMs: state.body.item.duration_ms,
                    positionMs: state.body.progress_ms || 0,
                    isPlaying: state.body.is_playing,
                    timestamp: Date.now(),
                };
                UIManager.setPlaybackState(currentState);
                // Send the host's state to the server
                ws.send(JSON.stringify({ type: 'playback-state-update', payload: currentState }));
            }
            else {
                // If nothing is playing, send a "paused" state
                const lastState = UIManager.getPlaybackState();
                if (lastState && lastState.isPlaying) {
                    const pausedState = Object.assign(Object.assign({}, lastState), { isPlaying: false });
                    UIManager.setPlaybackState(pausedState);
                    ws.send(JSON.stringify({ type: 'playback-state-update', payload: pausedState }));
                }
                else {
                    UIManager.setPlaybackState(null);
                }
            }
            UIManager.render();
        }
        catch (e) {
            // Could be a token error, etc.
        }
    }), 2000); // Poll every 2 seconds
};
function main() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            spotifyApi = yield (0, tokenManager_1.getAuthenticatedApi)();
            const me = yield spotifyApi.getMe();
            UIManager.setMe({ id: me.body.id, username: me.body.display_name || 'User' });
            readline.emitKeypressEvents(process.stdin);
            if (process.stdin.isTTY)
                process.stdin.setRawMode(true);
            // Attach the handler for the first time
            process.stdin.on('keypress', keypressHandler);
            process.on('exit', () => {
                console.log(`\n\n${chalk_1.default.bold.magenta('Happy Listening!')}\n`);
                process.stdout.write('\x1B[?25h');
            });
            UIManager.render();
        }
        catch (error) {
            if (error instanceof Error) {
                console.error(chalk_1.default.red('\n🛑 Application failed to start:'), chalk_1.default.yellow(error.message));
            }
            else {
                console.error(chalk_1.default.red('\n🛑 An unknown error occurred.'), error);
            }
            process.exit(1);
        }
    });
}
main();
