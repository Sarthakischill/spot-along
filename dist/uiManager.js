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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.render = render;
exports.setMe = setMe;
exports.getMe = getMe;
exports.setIsHost = setIsHost;
exports.setMode = setMode;
exports.setRoom = setRoom;
exports.getPlaybackState = getPlaybackState;
exports.setPlaybackState = setPlaybackState;
exports.setRoomState = setRoomState;
exports.showNotification = showNotification;
const chalk_1 = __importDefault(require("chalk"));
const log_update_1 = __importDefault(require("log-update"));
const chalk_animation_1 = __importDefault(require("chalk-animation"));
const TokenManager = __importStar(require("./tokenManager"));
const uiState = {
    me: null,
    isHost: false,
    mode: 'menu', // Add prompt state
    room: null,
    lastPlaybackState: null,
    roomState: null, // Add new state property
    notification: null,
    notificationTimeout: null,
};
const titleAnimation = chalk_animation_1.default.karaoke('ListenAlong', 2);
// A helper for creating hyperlinks in modern terminals
const link = (text, url) => `\u001b]8;;${url}\u0007${text}\u001b]8;;\u0007`;
function createProgressBar(progress, width = 30) {
    const filled = Math.round(progress * width);
    const empty = width - filled;
    return `[${chalk_1.default.green('━'.repeat(filled))}${chalk_1.default.gray('━'.repeat(empty))}]`;
}
function formatDuration(ms) {
    if (isNaN(ms) || ms < 0)
        return '00:00';
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}
// The main render loop using log-update for flicker-free UI
function render() {
    var _a;
    process.stdout.write('\x1B[?25l'); // Hide cursor
    log_update_1.default.clear();
    let mainContent = '';
    if (uiState.mode === 'menu')
        mainContent = drawMenu();
    else if (uiState.mode === 'in-room')
        mainContent = drawInRoomUI();
    else if (uiState.mode === 'help')
        mainContent = drawHelpScreen();
    // When prompting, we let readline handle the output, so we draw nothing.
    else if (uiState.mode === 'prompt')
        return;
    const header = `${chalk_1.default.bold.magenta('🎵 ListenAlong')} - Welcome, ${chalk_1.default.cyan(((_a = uiState.me) === null || _a === void 0 ? void 0 : _a.username) || 'User')}\n`;
    const footer = `\n${chalk_1.default.gray('──────────────────────────────────')}\nMade with ${chalk_1.default.red('♥')} by ${link('Sarthak', 'https://x.com/Sarthakhuh')}`;
    let notificationLine = '';
    if (uiState.notification) {
        notificationLine = `\n\n${chalk_1.default.yellow('⚡')} ${chalk_1.default.yellow(uiState.notification)}`;
    }
    (0, log_update_1.default)(`${header}${mainContent}${notificationLine}${footer}`);
}
function drawMenu() {
    let content = `\n${chalk_1.default.bold('Main Menu')}\n\n`;
    content += `  ${chalk_1.default.cyanBright.bold('[c]')} - Create a new listening room\n`;
    content += `  ${chalk_1.default.cyanBright.bold('[j]')} - Join an existing room\n`;
    content += `  ${chalk_1.default.cyanBright.bold('[h]')} - Help & Settings\n\n`;
    content += `  ${chalk_1.default.cyanBright.bold('[q]')} - Quit\n`;
    return content;
}
function drawInRoomUI() {
    const playbackState = uiState.lastPlaybackState;
    const roomState = uiState.roomState;
    let content = `${chalk_1.default.bold('› In Room:')} ${chalk_1.default.greenBright(uiState.room)}\n\n`;
    if (!playbackState || !playbackState.trackName) {
        content += chalk_1.default.bold.red('⏹️ Playback is paused or nothing is active on Spotify.');
    }
    else {
        const progressPercent = playbackState.positionMs / playbackState.durationMs;
        const progressBar = createProgressBar(progressPercent);
        content += `  🎧 ${chalk_1.default.bold.white(playbackState.trackName)}\n`;
        content += `     ${chalk_1.default.cyan(playbackState.artistName)}\n\n`;
        content += `     ${progressBar} ${formatDuration(playbackState.positionMs)} / ${formatDuration(playbackState.durationMs)}`;
    }
    content += `\n\n${chalk_1.default.bold('Members in Room:')}\n`;
    if (roomState && roomState.members) {
        roomState.members.forEach(member => {
            var _a;
            const isYou = member.id === ((_a = uiState.me) === null || _a === void 0 ? void 0 : _a.id) ? chalk_1.default.gray(' (you)') : '';
            if (member.id === roomState.hostId) {
                content += `   ${chalk_1.default.yellow('👑')} ${chalk_1.default.bold(member.username)} (Host)${isYou}\n`;
            }
            else {
                content += `      ${member.username}${isYou}\n`;
            }
        });
    }
    content += `\n\n${chalk_1.default.gray('Press [q] to leave the room.')}`;
    return content;
}
function drawHelpScreen() {
    const configPath = TokenManager.getConfigPath();
    let content = `${chalk_1.default.bold.yellow('⚙️ Help & Settings')}\n\n`;
    content += `Your Spotify authentication tokens are stored at:\n`;
    content += `${chalk_1.default.cyan(configPath)}\n\n`;
    content += `If you have issues, you can reset the application by deleting this file.\n\n`;
    content += `  ${chalk_1.default.redBright.bold('[r]')} - Reset Configuration (deletes the file)\n`;
    content += `  ${chalk_1.default.cyanBright.bold('[b]')} - Back to Main Menu\n`;
    return content;
}
// --- UI State Updaters ---
function setMe(me) { uiState.me = me; }
function getMe() { return uiState.me; }
function setIsHost(isHost) { uiState.isHost = isHost; }
function setMode(mode) { uiState.mode = mode; }
function setRoom(roomId) { uiState.room = roomId; }
function getPlaybackState() { return uiState.lastPlaybackState; }
function setPlaybackState(state) { uiState.lastPlaybackState = state; }
function setRoomState(state) { uiState.roomState = state; }
function showNotification(message, duration = 3000) {
    if (uiState.notificationTimeout)
        clearTimeout(uiState.notificationTimeout);
    uiState.notification = message;
    render();
    uiState.notificationTimeout = setTimeout(() => {
        uiState.notification = null;
        render();
    }, duration);
}
