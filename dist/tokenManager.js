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
// The PUBLIC URL of your deployed authentication service.
const AUTH_SERVICE_URL = 'https://spot-along-auth.sarthakshitole.workers.dev';
const paths = (0, env_paths_1.default)('ListenAlong', { suffix: '' });
const configPath = path_1.default.join(paths.config, 'config.json');
// Save tokens to the user's config directory
function saveTokens(data) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            yield fs_extra_1.default.ensureDir(path_1.default.dirname(configPath));
            yield fs_extra_1.default.writeJson(configPath, data, { spaces: 2 });
        }
        catch (error) {
            // Silently handle save errors, as the app can continue without saving
        }
    });
}
// Load tokens from the user's config directory
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
            // If config file is corrupted, delete it and force re-auth
            yield resetConfig();
            return null;
        }
    });
}
// Get an authenticated Spotify API instance
function getAuthenticatedApi() {
    return __awaiter(this, void 0, void 0, function* () {
        // The API object no longer needs credentials. This is correct.
        const spotifyApi = new spotify_web_api_node_1.default();
        const savedTokens = yield loadTokens();
        if (savedTokens) {
            try {
                console.log(chalk_1.default.gray('🔄 Verifying saved session...'));
                // THIS IS THE NEW LOGIC: Ask OUR server to refresh the token.
                const response = yield fetch(`${AUTH_SERVICE_URL}/refresh`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ refresh_token: savedTokens.refreshToken })
                });
                if (!response.ok) {
                    // If our server says the refresh failed, the token is truly invalid.
                    throw new Error('Could not refresh session.');
                }
                const newTokens = yield response.json();
                const newAccessToken = newTokens.access_token;
                // Spotify might issue a new refresh token, so we save that too if it exists.
                const newRefreshToken = newTokens.refresh_token || savedTokens.refreshToken;
                spotifyApi.setAccessToken(newAccessToken);
                spotifyApi.setRefreshToken(newRefreshToken);
                // Now, confirm the refreshed token works
                const { body: me } = yield spotifyApi.getMe();
                yield saveTokens({
                    accessToken: newAccessToken,
                    refreshToken: newRefreshToken,
                    expiresAt: Date.now() + (newTokens.expires_in * 1000),
                });
                console.log(chalk_1.default.green(`✅ Welcome back, ${me.display_name || me.id}!`));
                // The premium check is now implicitly handled by the app's core functions.
                // If a user tries to host without premium capabilities, the spotifyApi calls will fail at that point.
                return spotifyApi;
            }
            catch (error) {
                console.log(chalk_1.default.yellow('🔄 Saved session is invalid. Starting fresh authentication.'));
                yield resetConfig();
            }
        }
        // This block for fresh authentication remains the same and is correct.
        console.log(chalk_1.default.cyan('🔐 First time setup - Spotify authentication required.'));
        try {
            const tokenData = yield performAutomatedAuthentication();
            spotifyApi.setAccessToken(tokenData.accessToken);
            spotifyApi.setRefreshToken(tokenData.refreshToken);
            yield saveTokens(tokenData); // Save tokens first
            // Now get the user info to welcome them
            const { body: me } = yield spotifyApi.getMe();
            console.log(chalk_1.default.green(`✅ Successfully authenticated as ${me.display_name || me.id}!`));
            // The premium check is now implicitly handled by the app's core functions.
            // If a user tries to host without premium capabilities, the spotifyApi calls will fail at that point.
            return spotifyApi;
        }
        catch (authError) {
            yield resetConfig();
            const errorMessage = authError instanceof Error ? authError.message : 'An unknown authentication error occurred.';
            throw new Error(`Authentication failed: ${errorMessage}`);
        }
    });
}
// Handles the browser-based auth flow
function performAutomatedAuthentication() {
    return new Promise((resolve, reject) => __awaiter(this, void 0, void 0, function* () {
        const sessionId = (0, crypto_1.randomUUID)();
        const loginUrl = `${AUTH_SERVICE_URL}/login?sessionId=${sessionId}`;
        const checkUrl = `${AUTH_SERVICE_URL}/check-token?sessionId=${sessionId}`;
        const pollInterval = 2500;
        const timeout = 120000; // 2 minutes
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
            reject(new Error('Authentication timed out after 2 minutes. Please try again.'));
        }, timeout);
        const intervalId = setInterval(() => __awaiter(this, void 0, void 0, function* () {
            if (isFinalized)
                return;
            try {
                const response = yield fetch(checkUrl);
                if (response.ok) { // Status 200-299
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
                else if (response.status === 404) {
                    // This is expected. Waiting for user to log in.
                }
                else {
                    const errorText = yield response.text().catch(() => 'Server returned an unreadable error.');
                    throw new Error(`Auth service failed with status ${response.status}: ${errorText}`);
                }
            }
            catch (error) {
                let detail = 'Unknown error';
                if (error instanceof Error) {
                    // Capture the error's name (e.g., TypeError) and message
                    detail = `${error.name}: ${error.message}`;
                }
                const friendlyError = new Error(`Polling for authentication failed. This is likely a local network issue (e.g., firewall, proxy, or VPN blocking the request). Please check your settings and try again. \n  Underlying error: ${detail}`);
                cleanup(intervalId, timeoutId);
                reject(friendlyError);
            }
        }), pollInterval);
        // This part for opening the browser remains unchanged.
        try {
            console.log(chalk_1.default.cyan('\n🌐 Opening browser for Spotify authentication...'));
            console.log(chalk_1.default.gray("If the browser doesn't open, please visit this URL:"));
            console.log(chalk_1.default.blue(loginUrl));
            console.log(chalk_1.default.gray('\nWaiting for you to complete authentication in your browser...\n'));
            yield (0, open_1.default)(loginUrl);
        }
        catch (error) {
            console.log(chalk_1.default.yellow('\n⚠️  Could not open browser automatically.'));
            console.log(chalk_1.default.cyan('Please manually open this URL in your browser:'));
            console.log(chalk_1.default.blue(loginUrl));
            console.log(chalk_1.default.gray('\nWaiting for you to complete authentication...\n'));
        }
    }));
}
// Gets path to config file (for help screen)
function getConfigPath() {
    const paths = (0, env_paths_1.default)('ListenAlong', { suffix: '' });
    return path_1.default.join(paths.config, 'config.json');
}
// Deletes the saved token file
function resetConfig() {
    return __awaiter(this, void 0, void 0, function* () {
        const configFilePath = getConfigPath();
        try {
            if (yield fs_extra_1.default.pathExists(configFilePath)) {
                yield fs_extra_1.default.remove(configFilePath);
            }
        }
        catch (error) {
            // This should not fail, but if it does, there's not much we can do
            console.error('Failed to reset configuration:', error);
        }
    });
}
