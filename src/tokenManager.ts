import fs from 'fs-extra';
import path from 'path';
import envPaths from 'env-paths';
import SpotifyWebApi from 'spotify-web-api-node';
import open from 'open';
import chalk from 'chalk';
import { randomUUID } from 'crypto';

// The PUBLIC URL of your deployed authentication service.
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
        await fs.writeJson(configPath, data, { spaces: 2 });
    } catch (error) {
        // Silently handle save errors, as the app can continue without saving
    }
}

// Load tokens from the user's config directory
async function loadTokens(): Promise<TokenData | null> {
    try {
        if (await fs.pathExists(configPath)) {
            const data = await fs.readJson(configPath);
            if (data && data.accessToken && data.refreshToken) {
                return data as TokenData;
            }
        }
        return null;
    } catch (error) {
        // If config file is corrupted, delete it and force re-auth
        await resetConfig();
        return null;
    }
}

// Get an authenticated Spotify API instance
export async function getAuthenticatedApi(): Promise<SpotifyWebApi> {
    // The API object no longer needs credentials. This is correct.
    const spotifyApi = new SpotifyWebApi();
    const savedTokens = await loadTokens();

    if (savedTokens) {
        try {
            console.log(chalk.gray('🔄 Verifying saved session...'));

            // THIS IS THE NEW LOGIC: Ask OUR server to refresh the token.
            const response = await fetch(`${AUTH_SERVICE_URL}/refresh`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ refresh_token: savedTokens.refreshToken })
            });

            if (!response.ok) {
                // If our server says the refresh failed, the token is truly invalid.
                throw new Error('Could not refresh session.');
            }
            
            const newTokens = await response.json();
            const newAccessToken = newTokens.access_token;
            // Spotify might issue a new refresh token, so we save that too if it exists.
            const newRefreshToken = newTokens.refresh_token || savedTokens.refreshToken;

            spotifyApi.setAccessToken(newAccessToken);
            spotifyApi.setRefreshToken(newRefreshToken);

            // Now, confirm the refreshed token works
            const { body: me } = await spotifyApi.getMe();
            
            await saveTokens({
                accessToken: newAccessToken,
                refreshToken: newRefreshToken,
                expiresAt: Date.now() + (newTokens.expires_in * 1000),
            });
            
            console.log(chalk.green(`✅ Welcome back, ${me.display_name || me.id}!`));

            // The premium check is now implicitly handled by the app's core functions.
            // If a user tries to host without premium capabilities, the spotifyApi calls will fail at that point.
            return spotifyApi;
            
        } catch (error) {
            console.log(chalk.yellow('🔄 Saved session is invalid. Starting fresh authentication.'));
            await resetConfig();
        }
    }

    // This block for fresh authentication remains the same and is correct.
    console.log(chalk.cyan('🔐 First time setup - Spotify authentication required.'));
    
    try {
        const tokenData = await performAutomatedAuthentication();
        
        spotifyApi.setAccessToken(tokenData.accessToken);
        spotifyApi.setRefreshToken(tokenData.refreshToken);

        await saveTokens(tokenData); // Save tokens first

        // Now get the user info to welcome them
        const { body: me } = await spotifyApi.getMe(); 
        console.log(chalk.green(`✅ Successfully authenticated as ${me.display_name || me.id}!`));

        // The premium check is now implicitly handled by the app's core functions.
        // If a user tries to host without premium capabilities, the spotifyApi calls will fail at that point.
        return spotifyApi;
        
    } catch (authError: any) {
        await resetConfig();
        const errorMessage = authError instanceof Error ? authError.message : 'An unknown authentication error occurred.';
        throw new Error(`Authentication failed: ${errorMessage}`);
    }
}

// Handles the browser-based auth flow
function performAutomatedAuthentication(): Promise<TokenData> {
    return new Promise(async (resolve, reject) => {
        const sessionId = randomUUID();
        const loginUrl = `${AUTH_SERVICE_URL}/login?sessionId=${sessionId}`;
        const checkUrl = `${AUTH_SERVICE_URL}/check-token?sessionId=${sessionId}`;
        const pollInterval = 2500;
        const timeout = 120000; // 2 minutes
        let isFinalized = false;

        const cleanup = (intervalId: NodeJS.Timeout, timeoutId: NodeJS.Timeout) => {
            isFinalized = true;
            clearInterval(intervalId);
            clearTimeout(timeoutId);
        };

        const timeoutId = setTimeout(() => {
            if (isFinalized) return;
            cleanup(intervalId, timeoutId);
            reject(new Error('Authentication timed out after 2 minutes. Please try again.'));
        }, timeout);

        const intervalId = setInterval(async () => {
            if (isFinalized) return;
            
            try {
                const response = await fetch(checkUrl);

                if (response.ok) { // Status 200-299
                    const tokens = await response.json();
                    
                    if (!tokens.access_token || !tokens.refresh_token) {
                        throw new Error('Invalid token response from auth service.');
                    }
                    
                    cleanup(intervalId, timeoutId);
                    
                    resolve({
                        accessToken: tokens.access_token,
                        refreshToken: tokens.refresh_token,
                        expiresAt: Date.now() + (tokens.expires_in || 3600) * 1000,
                    });

                } else if (response.status === 404) {
                    // This is expected. Waiting for user to log in.
                } else {
                    const errorText = await response.text().catch(() => 'Server returned an unreadable error.');
                    throw new Error(`Auth service failed with status ${response.status}: ${errorText}`);
                }
            } catch (error) {
                let detail = 'Unknown error';
                if (error instanceof Error) {
                    // Capture the error's name (e.g., TypeError) and message
                    detail = `${error.name}: ${error.message}`;
                }

                const friendlyError = new Error(
                    `Polling for authentication failed. This is likely a local network issue (e.g., firewall, proxy, or VPN blocking the request). Please check your settings and try again. \n  Underlying error: ${detail}`
                );
                
                cleanup(intervalId, timeoutId);
                reject(friendlyError); 
            }
        }, pollInterval);

        // This part for opening the browser remains unchanged.
        try {
            console.log(chalk.cyan('\n🌐 Opening browser for Spotify authentication...'));
            console.log(chalk.gray("If the browser doesn't open, please visit this URL:"));
            console.log(chalk.blue(loginUrl));
            console.log(chalk.gray('\nWaiting for you to complete authentication in your browser...\n'));
            await open(loginUrl);
        } catch (error) {
            console.log(chalk.yellow('\n⚠️  Could not open browser automatically.'));
            console.log(chalk.cyan('Please manually open this URL in your browser:'));
            console.log(chalk.blue(loginUrl));
            console.log(chalk.gray('\nWaiting for you to complete authentication...\n'));
        }
    });
}

// Gets path to config file (for help screen)
export function getConfigPath(): string {
    const paths = envPaths('ListenAlong', { suffix: '' });
    return path.join(paths.config, 'config.json');
}

// Deletes the saved token file
export async function resetConfig(): Promise<void> {
    const configFilePath = getConfigPath();
    try {
        if (await fs.pathExists(configFilePath)) {
            await fs.remove(configFilePath);
        }
    } catch (error) {
        // This should not fail, but if it does, there's not much we can do
        console.error('Failed to reset configuration:', error);
    }
} 