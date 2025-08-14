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
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { version } = require('../package.json');
dotenv_1.default.config({ quiet: true });
const BASE_SERVER_ADDRESS = 'spot-along-server.sarthakshitole.workers.dev';
let currentMode = 'menu';
let ws = null;
let spotifyApi;
let isHost = false;
let hostPollingInterval = null;
let isConnecting = false;
let connectionTimeout = null;
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});
const keypressHandler = (str, key) => __awaiter(void 0, void 0, void 0, function* () {
    if (key.ctrl && key.name === 'c') {
        cleanup();
        process.exit();
    }
    if (isConnecting || currentMode === 'prompt')
        return;
    if (currentMode === 'menu') {
        switch (key.name) {
            case 'c':
                if (!isConnecting)
                    yield connectToRoom('create');
                return;
            case 'j':
                if (!isConnecting) {
                    const roomId = yield promptForRoomId();
                    if (roomId)
                        yield connectToRoom('join', roomId);
                    UIManager.render();
                }
                return;
            case 'h':
                currentMode = 'help';
                UIManager.setMode('help');
                break;
            case 'q':
                cleanup();
                process.exit();
        }
    }
    else if (currentMode === 'in-room') {
        if (key.name === 'q')
            leaveRoom();
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
            return;
        }
    }
    UIManager.render();
});
function connectToRoom(action, roomId) {
    return __awaiter(this, void 0, void 0, function* () {
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
            yield spotifyApi.getMe();
        }
        catch (error) {
            try {
                const data = yield spotifyApi.refreshAccessToken();
                spotifyApi.setAccessToken(data.body['access_token']);
                yield spotifyApi.getMe();
            }
            catch (refreshError) {
                isConnecting = false;
                UIManager.showNotification('Authentication expired. Please restart the app.', 5000);
                UIManager.render();
                return;
            }
        }
        UIManager.showNotification(`${action === 'create' ? 'Creating room' : 'Joining room'}...`, 30000);
        UIManager.render();
        connectionTimeout = setTimeout(() => {
            if (ws)
                ws.terminate();
            isConnecting = false;
            UIManager.showNotification('Connection timed out. Server may be unavailable.', 5000);
            UIManager.render();
        }, 10000);
        try {
            ws = new ws_1.default(fullAddress);
            ws.on('open', () => {
                if (connectionTimeout) {
                    clearTimeout(connectionTimeout);
                    connectionTimeout = null;
                }
                try {
                    const token = spotifyApi.getAccessToken();
                    if (!token) {
                        handleConnectionError('Auth token is missing.');
                        return;
                    }
                    const type = action === 'create' ? 'create-room' : 'join-room';
                    ws.send(JSON.stringify({ type, payload: { accessToken: token } }));
                }
                catch (error) {
                    handleConnectionError('Failed to send connection message.');
                }
            });
            ws.on('message', (data) => {
                try {
                    const message = JSON.parse(data.toString());
                    handleWebSocketMessage(message);
                }
                catch (error) {
                    handleConnectionError('Invalid message from server.');
                }
            });
            ws.on('close', (code, reason) => handleConnectionClose(code, reason === null || reason === void 0 ? void 0 : reason.toString()));
            ws.on('error', (err) => handleConnectionError(`Connection failed: ${err.message}`));
        }
        catch (error) {
            isConnecting = false;
            if (connectionTimeout) {
                clearTimeout(connectionTimeout);
                connectionTimeout = null;
            }
            UIManager.showNotification('Failed to create connection.', 5000);
            UIManager.render();
        }
    });
}
function handleWebSocketMessage(message) {
    switch (message.type) {
        case 'room-created':
            isConnecting = false;
            isHost = true;
            currentMode = 'in-room';
            UIManager.setRoom(message.payload.roomId);
            UIManager.setMode('in-room');
            startHostPolling();
            UIManager.showNotification(`Room ${message.payload.roomId} created!`, 6000);
            break;
        case 'joined-room':
            isConnecting = false;
            isHost = false;
            currentMode = 'in-room';
            UIManager.setRoom(message.payload.roomId);
            UIManager.setMode('in-room');
            UIManager.showNotification(`Joined room ${message.payload.roomId}!`, 4000);
            break;
        case 'room-state-update':
            UIManager.setRoomState(message.payload);
            break;
        case 'force-sync':
            if (!isHost)
                syncToHostPlayback(message.payload);
            break;
        case 'error':
            isConnecting = false;
            UIManager.showNotification(message.payload.message, 5000);
            leaveRoom();
            break;
    }
    UIManager.render();
}
function handleConnectionError(errorMessage) {
    isConnecting = false;
    if (connectionTimeout) {
        clearTimeout(connectionTimeout);
        connectionTimeout = null;
    }
    cleanup();
    currentMode = 'menu';
    UIManager.setMode('menu');
    UIManager.showNotification(errorMessage, 5000);
    UIManager.render();
}
function handleConnectionClose(code, reason) {
    isConnecting = false;
    if (connectionTimeout) {
        clearTimeout(connectionTimeout);
        connectionTimeout = null;
    }
    if (currentMode === 'menu')
        return;
    cleanup();
    currentMode = 'menu';
    UIManager.setMode('menu');
    if (code !== 1000)
        UIManager.showNotification('Connection lost.', 4000);
    UIManager.render();
}
function syncToHostPlayback(state) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            UIManager.setPlaybackState(state);
            if (state.isPlaying) {
                yield spotifyApi.play({ uris: [state.trackUri], position_ms: state.positionMs });
            }
            else {
                yield spotifyApi.pause();
            }
        }
        catch (error) {
            if (error.message.includes('401')) {
                try {
                    const data = yield spotifyApi.refreshAccessToken();
                    spotifyApi.setAccessToken(data.body['access_token']);
                    yield syncToHostPlayback(state); // Retry
                }
                catch (refreshError) { /* Silent fail */ }
            }
        }
    });
}
function leaveRoom() {
    cleanup();
    currentMode = 'menu';
    UIManager.setMode('menu');
    UIManager.showNotification('Left room.', 2000);
    UIManager.render();
    if (ws)
        ws.close(1000, 'User left room');
}
function cleanup() {
    if (ws) {
        ws.terminate();
        ws = null;
    }
    if (hostPollingInterval) {
        clearInterval(hostPollingInterval);
        hostPollingInterval = null;
    }
    if (connectionTimeout) {
        clearTimeout(connectionTimeout);
        connectionTimeout = null;
    }
    isHost = false;
    isConnecting = false;
}
function promptForRoomId() {
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
        console.log(chalk_1.default.bold.magenta('🎵 ListenAlong') + chalk_1.default.gray(' - Join Room'));
        console.log('');
        const promptRl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });
        promptRl.question(chalk_1.default.cyanBright('Enter Room ID (or Enter to cancel): '), (input) => {
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
    if (hostPollingInterval)
        clearInterval(hostPollingInterval);
    let lastStateHash = '';
    let consecutiveErrors = 0;
    hostPollingInterval = setInterval(() => __awaiter(void 0, void 0, void 0, function* () {
        if (!isHost || !ws || ws.readyState !== ws_1.default.OPEN) {
            if (hostPollingInterval)
                clearInterval(hostPollingInterval);
            return;
        }
        try {
            const state = yield spotifyApi.getMyCurrentPlaybackState();
            let currentState = null;
            if (state.body && state.body.item && 'artists' in state.body.item) {
                currentState = {
                    trackName: state.body.item.name,
                    artistName: state.body.item.artists.map((a) => a.name).join(', '),
                    trackUri: state.body.item.uri,
                    durationMs: state.body.item.duration_ms,
                    positionMs: state.body.progress_ms || 0,
                    isPlaying: state.body.is_playing,
                    timestamp: Date.now(),
                };
            }
            else if (UIManager.getPlaybackState()) {
                currentState = Object.assign(Object.assign({}, UIManager.getPlaybackState()), { isPlaying: false });
            }
            if (currentState)
                UIManager.setPlaybackState(currentState);
            const stateHash = currentState ? `${currentState.trackUri}-${currentState.isPlaying}-${Math.floor(currentState.positionMs / 5000)}` : 'null';
            if (stateHash !== lastStateHash) {
                lastStateHash = stateHash;
                if (ws && ws.readyState === ws_1.default.OPEN && currentState) {
                    ws.send(JSON.stringify({ type: 'playback-state-update', payload: Object.assign(Object.assign({}, currentState), { accessToken: spotifyApi.getAccessToken() }) }));
                }
            }
            if (currentMode === 'in-room')
                UIManager.render();
            consecutiveErrors = 0;
        }
        catch (error) {
            consecutiveErrors++;
            if (error.message.includes('401')) {
                try {
                    const data = yield spotifyApi.refreshAccessToken();
                    if (data.body['access_token']) {
                        spotifyApi.setAccessToken(data.body['access_token']);
                        consecutiveErrors = 0;
                    }
                }
                catch (refreshError) {
                    if (consecutiveErrors > 3) {
                        UIManager.showNotification('Auth expired. Please restart.', 5000);
                        leaveRoom();
                    }
                }
            }
            else if (consecutiveErrors > 10) {
                UIManager.showNotification('Connection issues. Please restart.', 5000);
                leaveRoom();
            }
        }
    }), 2000);
};
function main() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            console.log(`--- EXECUTING SPOTALONG VERSION ${version} ---`);
            spotifyApi = yield (0, tokenManager_1.getAuthenticatedApi)();
            const me = yield spotifyApi.getMe();
            UIManager.setMe({ id: me.body.id, username: me.body.display_name || 'User' });
            readline.emitKeypressEvents(process.stdin);
            if (process.stdin.isTTY) {
                process.stdin.setRawMode(true);
            }
            process.stdin.on('keypress', keypressHandler);
            process.on('exit', () => {
                cleanup();
                console.log(`\n\n${chalk_1.default.bold.magenta('Happy Listening!')}\n`);
                process.stdout.write('\x1B[?25h');
            });
            const gracefulShutdown = () => { cleanup(); process.exit(); };
            process.on('SIGINT', gracefulShutdown);
            process.on('SIGTERM', gracefulShutdown);
            UIManager.render();
        }
        catch (error) {
            // Final, Production-Ready Catch Block
            console.error(chalk_1.default.red('\n🛑 Application failed to start:'));
            if (error.statusCode === 403) {
                console.error(chalk_1.default.yellow('Authentication succeeded, but Spotify blocked access (403 Forbidden).'));
                console.error(chalk_1.default.cyan('This usually means the app is in "Development Mode" and your Spotify account has not been added to the allowed users list.'));
                console.error(chalk_1.default.cyan('Please contact the developer and ask them to add your Spotify email to "Users and Access" in their Spotify Developer Dashboard.'));
            }
            else if (error.name === 'WebApiError' && error.body && error.body.error) {
                const spotifyError = error.body.error;
                const statusCode = error.statusCode || 'N/A';
                const errorMessage = spotifyError.message || 'An unknown Spotify API error occurred.';
                console.error(chalk_1.default.yellow(`Spotify API Error (Status: ${statusCode}): ${errorMessage}`));
            }
            else if (error instanceof Error) {
                console.error(chalk_1.default.yellow(error.message));
            }
            else {
                console.error(chalk_1.default.yellow('An unexpected error occurred:'), error);
            }
            process.exit(1);
        }
    });
}
main();
