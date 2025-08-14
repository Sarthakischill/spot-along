"use strict";
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
exports.getAuthenticatedApi = getAuthenticatedApi;
exports.getConfigPath = getConfigPath;
exports.resetConfig = resetConfig;
const fs_extra_1 = __importDefault(require("fs-extra"));
const path_1 = __importDefault(require("path"));
const env_paths_1 = __importDefault(require("env-paths"));
const spotify_web_api_node_1 = __importDefault(require("spotify-web-api-node"));
const open_1 = __importDefault(require("open"));
const chalk_1 = __importDefault(require("chalk"));
const crypto_1 = require("crypto");
const AUTH_SERVICE_URL = 'https://spot-along-auth.sarthakshitole.workers.dev';
const paths = (0, env_paths_1.default)('ListenAlong', { suffix: '' });
const configPath = path_1.default.join(paths.config, 'config.json');
function saveTokens(data) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            yield fs_extra_1.default.ensureDir(path_1.default.dirname(configPath));
            yield fs_extra_1.default.writeJson(configPath, data, { spaces: 2 });
        }
        catch (error) {
            // Silent
        }
    });
}
function loadTokens() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            if (yield fs_extra_1.default.pathExists(configPath)) {
                const data = yield fs_extra_1.default.readJson(configPath);
                if (data && data.accessToken && data.refreshToken) {
                    return data;
                }
            }
            return null;
        }
        catch (error) {
            yield resetConfig();
            return null;
        }
    });
}
function getAuthenticatedApi() {
    return __awaiter(this, void 0, void 0, function* () {
        const spotifyApi = new spotify_web_api_node_1.default();
        const savedTokens = yield loadTokens();
        if (savedTokens) {
            try {
                console.log(chalk_1.default.gray('🔄 Verifying saved session...'));
                const response = yield fetch(`${AUTH_SERVICE_URL}/refresh`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ refresh_token: savedTokens.refreshToken })
                });
                if (!response.ok) {
                    throw new Error('Could not refresh session from server.');
                }
                const newTokens = yield response.json();
                spotifyApi.setAccessToken(newTokens.access_token);
                spotifyApi.setRefreshToken(newTokens.refresh_token || savedTokens.refreshToken);
                const { body: me } = yield spotifyApi.getMe();
                yield saveTokens({
                    accessToken: newTokens.access_token,
                    refreshToken: newTokens.refresh_token || savedTokens.refreshToken,
                    expiresAt: Date.now() + (newTokens.expires_in * 1000),
                });
                console.log(chalk_1.default.green(`✅ Welcome back, ${me.display_name || me.id}!`));
                return spotifyApi;
            }
            catch (error) {
                console.log(chalk_1.default.yellow('🔄 Saved session is invalid. Starting fresh authentication.'));
                yield resetConfig();
            }
        }
        console.log(chalk_1.default.cyan('🔐 First time setup - Spotify authentication required.'));
        try {
            const tokenData = yield performAutomatedAuthentication();
            spotifyApi.setAccessToken(tokenData.accessToken);
            spotifyApi.setRefreshToken(tokenData.refreshToken);
            yield saveTokens(tokenData);
            const { body: me } = yield spotifyApi.getMe();
            console.log(chalk_1.default.green(`✅ Successfully authenticated as ${me.display_name || me.id}!`));
            return spotifyApi;
        }
        catch (authError) {
            yield resetConfig();
            throw authError; // Just throw the original error
        }
    });
}
function performAutomatedAuthentication() {
    return new Promise((resolve, reject) => __awaiter(this, void 0, void 0, function* () {
        const sessionId = (0, crypto_1.randomUUID)();
        const loginUrl = `${AUTH_SERVICE_URL}/login?sessionId=${sessionId}`;
        const checkUrl = `${AUTH_SERVICE_URL}/check-token?sessionId=${sessionId}`;
        const pollInterval = 2500;
        const timeout = 120000;
        let isFinalized = false;
        const cleanup = (intervalId, timeoutId) => {
            isFinalized = true;
            clearInterval(intervalId);
            clearTimeout(timeoutId);
        };
        const timeoutId = setTimeout(() => {
            if (isFinalized)
                return;
            cleanup(intervalId, timeoutId);
            reject(new Error('Authentication timed out. Please try again.'));
        }, timeout);
        const intervalId = setInterval(() => __awaiter(this, void 0, void 0, function* () {
            if (isFinalized)
                return;
            try {
                const response = yield fetch(checkUrl);
                if (response.ok) {
                    const tokens = yield response.json();
                    if (!tokens.access_token || !tokens.refresh_token) {
                        throw new Error('Invalid token response from auth service.');
                    }
                    cleanup(intervalId, timeoutId);
                    resolve({
                        accessToken: tokens.access_token,
                        refreshToken: tokens.refresh_token,
                        expiresAt: Date.now() + (tokens.expires_in || 3600) * 1000,
                    });
                }
                else if (response.status !== 404) {
                    const errorText = yield response.text().catch(() => 'Server returned an unreadable error.');
                    throw new Error(`Auth service failed with status ${response.status}: ${errorText}`);
                }
            }
            catch (error) {
                const detail = (error instanceof Error) ? `${error.name}: ${error.message}` : 'Unknown error';
                const friendlyError = new Error(`Polling for auth token failed. This could be a local network issue (firewall, VPN) or a server problem.\n  Underlying error: ${detail}`);
                cleanup(intervalId, timeoutId);
                reject(friendlyError);
            }
        }), pollInterval);
        try {
            console.log(chalk_1.default.cyan('\n🌐 Opening browser for Spotify authentication...'));
            console.log(chalk_1.default.gray("If the browser doesn't open, please visit this URL:"));
            console.log(chalk_1.default.blue(loginUrl));
            console.log(chalk_1.default.gray('\nWaiting for you to complete authentication in your browser...\n'));
            yield (0, open_1.default)(loginUrl);
        }
        catch (error) {
            console.log(chalk_1.default.yellow('\n⚠️  Could not open browser automatically. Please manually open this URL:'));
            console.log(chalk_1.default.blue(loginUrl));
        }
    }));
}
function getConfigPath() {
    return configPath;
}
function resetConfig() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            if (yield fs_extra_1.default.pathExists(configPath)) {
                yield fs_extra_1.default.remove(configPath);
            }
        }
        catch (error) {
            console.error('Failed to reset configuration:', error);
        }
    });
}
