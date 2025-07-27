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
const crypto_1 = require("crypto"); // Native Node.js module
// The PUBLIC URL of the auth service you just deployed.
// It's safe to hardcode this as it's public knowledge.
const AUTH_SERVICE_URL = 'https://spot-along-auth.sarthakshitole.workers.dev';
const paths = (0, env_paths_1.default)('ListenAlong', { suffix: '' });
const configPath = path_1.default.join(paths.config, 'config.json');
// Save tokens to the user's config directory
function saveTokens(data) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            yield fs_extra_1.default.ensureDir(path_1.default.dirname(configPath));
            yield fs_extra_1.default.writeJson(configPath, data);
        }
        catch (error) {
            console.error('Error saving tokens:', error);
        }
    });
}
// Load tokens from the user's config directory
function loadTokens() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            if (yield fs_extra_1.default.pathExists(configPath)) {
                const data = yield fs_extra_1.default.readJson(configPath);
                return data;
            }
            return null;
        }
        catch (error) {
            console.error('Error loading tokens:', error);
            return null;
        }
    });
}
// The main function with new validation logic
function getAuthenticatedApi() {
    return __awaiter(this, void 0, void 0, function* () {
        // IMPORTANT: The CLI tool NO LONGER needs client ID or secret.
        // It only needs to know how to talk to your auth service.
        const spotifyApi = new spotify_web_api_node_1.default();
        const savedTokens = yield loadTokens();
        if (savedTokens) {
            spotifyApi.setAccessToken(savedTokens.accessToken);
            spotifyApi.setRefreshToken(savedTokens.refreshToken);
            try {
                const data = yield spotifyApi.refreshAccessToken();
                const newAccessToken = data.body['access_token'];
                spotifyApi.setAccessToken(newAccessToken);
                const { body: me } = yield spotifyApi.getMe();
                if (me.product !== 'premium') {
                    yield resetConfig();
                    throw new Error('Your Spotify account is no longer Premium. Please log in with a Premium account.');
                }
                yield saveTokens({
                    accessToken: newAccessToken,
                    // Refresh token might be resent, use the new one if available, otherwise the old one
                    refreshToken: data.body['refresh_token'] || spotifyApi.getRefreshToken(),
                    expiresAt: Date.now() + data.body['expires_in'] * 1000,
                });
                return spotifyApi;
            }
            catch (error) {
                yield resetConfig();
                // The saved tokens are invalid, fall through to the full login flow.
            }
        }
        // --- Fallback: Full Automated Browser Authentication ---
        console.log(chalk_1.default.yellow('No valid tokens found. Starting login process...'));
        const tokenData = yield performAutomatedAuthentication();
        spotifyApi.setAccessToken(tokenData.accessToken);
        spotifyApi.setRefreshToken(tokenData.refreshToken);
        // Validate the new tokens to ensure a Premium account
        try {
            const { body: me } = yield spotifyApi.getMe();
            if (me.product !== 'premium') {
                throw new Error('This application requires a Spotify Premium account. The login was successful, but your account type is not supported.');
            }
            console.log(chalk_1.default.green(`Authenticated as Premium user: ${me.display_name}`));
            yield saveTokens(tokenData); // Now save the validated tokens
            return spotifyApi;
        }
        catch (error) {
            yield resetConfig(); // Clean up if validation fails
            throw error; // Re-throw the clear error message
        }
    });
}
// The new authentication flow with polling
function performAutomatedAuthentication() {
    return new Promise((resolve, reject) => __awaiter(this, void 0, void 0, function* () {
        const sessionId = (0, crypto_1.randomUUID)();
        const loginUrl = `${AUTH_SERVICE_URL}/login?sessionId=${sessionId}`;
        const checkUrl = `${AUTH_SERVICE_URL}/check-token?sessionId=${sessionId}`;
        const pollInterval = 2000; // Poll every 2 seconds
        const timeout = 120000; // 2-minute timeout
        let isResolved = false;
        const timeoutId = setTimeout(() => {
            if (!isResolved) {
                isResolved = true;
                clearInterval(intervalId);
                reject(new Error('Login timed out. Please try again.'));
            }
        }, timeout);
        const intervalId = setInterval(() => __awaiter(this, void 0, void 0, function* () {
            if (isResolved)
                return;
            try {
                const response = yield fetch(checkUrl);
                if (response.ok) {
                    const tokens = yield response.json();
                    isResolved = true;
                    clearTimeout(timeoutId);
                    clearInterval(intervalId);
                    const tokenData = {
                        accessToken: tokens.access_token,
                        refreshToken: tokens.refresh_token,
                        expiresAt: Date.now() + tokens.expires_in * 1000,
                    };
                    resolve(tokenData);
                }
                // If response is 404, we just ignore and poll again.
            }
            catch (error) {
                // Ignore network errors, etc., and let it poll again.
            }
        }), pollInterval);
        console.log(chalk_1.default.bold('\nA browser window will now open for you to log in to Spotify.'));
        yield (0, open_1.default)(loginUrl);
    }));
}
// Get the path to the config file (for help screen)
function getConfigPath() {
    const paths = (0, env_paths_1.default)('ListenAlong', { suffix: '' });
    return path_1.default.join(paths.config, 'config.json');
}
// Reset the configuration (delete saved tokens)
function resetConfig() {
    return __awaiter(this, void 0, void 0, function* () {
        const configFilePath = getConfigPath();
        try {
            if (yield fs_extra_1.default.pathExists(configFilePath)) {
                yield fs_extra_1.default.remove(configFilePath);
                console.log('Configuration file has been reset.');
            }
        }
        catch (error) {
            console.error('Failed to reset configuration:', error);
        }
    });
}
