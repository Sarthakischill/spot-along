import fs from 'fs-extra';
import path from 'path';
import envPaths from 'env-paths';
import SpotifyWebApi from 'spotify-web-api-node';
import open from 'open';
import chalk from 'chalk';
import { randomUUID } from 'crypto'; // Native Node.js module

// The PUBLIC URL of the auth service you just deployed.
// It's safe to hardcode this as it's public knowledge.
const AUTH_SERVICE_URL = 'https://spot-along-auth.sarthakshitole.workers.dev'; 

interface TokenData {
    accessToken: string;
    refreshToken: string;
    expiresAt: number;
}

const paths = envPaths('ListenAlong', { suffix: '' });
const configPath = path.join(paths.config, 'config.json');

// Save tokens to the user's config directory
async function saveTokens(data: TokenData): Promise<void> {
    try {
        await fs.ensureDir(path.dirname(configPath));
        await fs.writeJson(configPath, data);
    } catch (error) {
        console.error('Error saving tokens:', error);
    }
}

// Load tokens from the user's config directory
async function loadTokens(): Promise<TokenData | null> {
    try {
        if (await fs.pathExists(configPath)) {
            const data = await fs.readJson(configPath);
            return data as TokenData;
        }
        return null;
    } catch (error) {
        console.error('Error loading tokens:', error);
        return null;
    }
}

// The main function with new validation logic
export async function getAuthenticatedApi(): Promise<SpotifyWebApi> {
    // IMPORTANT: The CLI tool NO LONGER needs client ID or secret.
    // It only needs to know how to talk to your auth service.
    const spotifyApi = new SpotifyWebApi();

    const savedTokens = await loadTokens();

    if (savedTokens) {
        spotifyApi.setAccessToken(savedTokens.accessToken);
        spotifyApi.setRefreshToken(savedTokens.refreshToken);
        try {
            const data = await spotifyApi.refreshAccessToken();
            const newAccessToken = data.body['access_token'];
            spotifyApi.setAccessToken(newAccessToken);

            const { body: me } = await spotifyApi.getMe();
            if (me.product !== 'premium') {
                await resetConfig();
                throw new Error('Your Spotify account is no longer Premium. Please log in with a Premium account.');
            }

            await saveTokens({
                accessToken: newAccessToken,
                // Refresh token might be resent, use the new one if available, otherwise the old one
                refreshToken: data.body['refresh_token'] || spotifyApi.getRefreshToken()!,
                expiresAt: Date.now() + data.body['expires_in'] * 1000,
            });
            return spotifyApi;
        } catch (error: any) {
            await resetConfig();
            // The saved tokens are invalid, fall through to the full login flow.
        }
    }

    // --- Fallback: Full Automated Browser Authentication ---
    console.log(chalk.yellow('No valid tokens found. Starting login process...'));
    const tokenData = await performAutomatedAuthentication();

    spotifyApi.setAccessToken(tokenData.accessToken);
    spotifyApi.setRefreshToken(tokenData.refreshToken);

    // Validate the new tokens to ensure a Premium account
    try {
        const { body: me } = await spotifyApi.getMe();
        if (me.product !== 'premium') {
          throw new Error('This application requires a Spotify Premium account. The login was successful, but your account type is not supported.');
        }

        console.log(chalk.green(`Authenticated as Premium user: ${me.display_name}`));
        await saveTokens(tokenData); // Now save the validated tokens
        return spotifyApi;
    } catch (error: any) {
        await resetConfig(); // Clean up if validation fails
        throw error; // Re-throw the clear error message
    }
}

// The new authentication flow with polling
function performAutomatedAuthentication(): Promise<TokenData> {
    return new Promise(async (resolve, reject) => {
        const sessionId = randomUUID();
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

        const intervalId = setInterval(async () => {
            if (isResolved) return;
            try {
                const response = await fetch(checkUrl);
                if (response.ok) {
                    const tokens = await response.json();
                    isResolved = true;
                    clearTimeout(timeoutId);
                    clearInterval(intervalId);

                    const tokenData: TokenData = {
                        accessToken: tokens.access_token,
                        refreshToken: tokens.refresh_token,
                        expiresAt: Date.now() + tokens.expires_in * 1000,
                    };
                    resolve(tokenData);
                }
                // If response is 404, we just ignore and poll again.
            } catch (error) {
                // Ignore network errors, etc., and let it poll again.
            }
        }, pollInterval);

        console.log(chalk.bold('\nA browser window will now open for you to log in to Spotify.'));
        await open(loginUrl);
    });
}

// Get the path to the config file (for help screen)
export function getConfigPath(): string {
    const paths = envPaths('ListenAlong', { suffix: '' });
    return path.join(paths.config, 'config.json');
}

// Reset the configuration (delete saved tokens)
export async function resetConfig(): Promise<void> {
    const configFilePath = getConfigPath();
    try {
        if (await fs.pathExists(configFilePath)) {
            await fs.remove(configFilePath);
            console.log('Configuration file has been reset.');
        }
    } catch (error) {
        console.error('Failed to reset configuration:', error);
    }
} 