import fs from 'fs-extra';
import path from 'path';
import envPaths from 'env-paths';
import SpotifyWebApi from 'spotify-web-api-node';
import open from 'open';
import chalk from 'chalk';
import { randomUUID } from 'crypto';

const AUTH_SERVICE_URL = 'https://spot-along-auth.sarthakshitole.workers.dev';

interface TokenData {
    accessToken: string;
    refreshToken: string;
    expiresAt: number;
}

const paths = envPaths('ListenAlong', { suffix: '' });
const configPath = path.join(paths.config, 'config.json');

async function saveTokens(data: TokenData): Promise<void> {
    try {
        await fs.ensureDir(path.dirname(configPath));
        await fs.writeJson(configPath, data, { spaces: 2 });
    } catch (error) {
        // Silent
    }
}

async function loadTokens(): Promise<TokenData | null> {
    try {
        if (await fs.pathExists(configPath)) {
            const data = await fs.readJson(configPath);
            if (data && data.accessToken && data.refreshToken) {
                return data;
            }
        }
        return null;
    } catch (error) {
        await resetConfig();
        return null;
    }
}

export async function getAuthenticatedApi(): Promise<SpotifyWebApi> {
    const spotifyApi = new SpotifyWebApi();
    const savedTokens = await loadTokens();

    if (savedTokens) {
        try {
            console.log(chalk.gray('🔄 Verifying saved session...'));
            const response = await fetch(`${AUTH_SERVICE_URL}/refresh`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ refresh_token: savedTokens.refreshToken })
            });
            if (!response.ok) {
                throw new Error('Could not refresh session from server.');
            }
            const newTokens = await response.json();
            spotifyApi.setAccessToken(newTokens.access_token);
            spotifyApi.setRefreshToken(newTokens.refresh_token || savedTokens.refreshToken);
            const { body: me } = await spotifyApi.getMe();
            await saveTokens({
                accessToken: newTokens.access_token,
                refreshToken: newTokens.refresh_token || savedTokens.refreshToken,
                expiresAt: Date.now() + (newTokens.expires_in * 1000),
            });
            console.log(chalk.green(`✅ Welcome back, ${me.display_name || me.id}!`));
            return spotifyApi;
        } catch (error) {
            console.log(chalk.yellow('🔄 Saved session is invalid. Starting fresh authentication.'));
            await resetConfig();
        }
    }

    console.log(chalk.cyan('🔐 First time setup - Spotify authentication required.'));

    try {
        const tokenData = await performAutomatedAuthentication();
        spotifyApi.setAccessToken(tokenData.accessToken);
        spotifyApi.setRefreshToken(tokenData.refreshToken);
        await saveTokens(tokenData);
        const { body: me } = await spotifyApi.getMe();
        console.log(chalk.green(`✅ Successfully authenticated as ${me.display_name || me.id}!`));
        return spotifyApi;
    } catch (authError: any) {
        await resetConfig();
        throw authError; // Just throw the original error
    }
}

function performAutomatedAuthentication(): Promise<TokenData> {
    return new Promise(async (resolve, reject) => {
        const sessionId = randomUUID();
        const loginUrl = `${AUTH_SERVICE_URL}/login?sessionId=${sessionId}`;
        const checkUrl = `${AUTH_SERVICE_URL}/check-token?sessionId=${sessionId}`;
        const pollInterval = 2500;
        const timeout = 120000;
        let isFinalized = false;

        const cleanup = (intervalId: NodeJS.Timeout, timeoutId: NodeJS.Timeout) => {
            isFinalized = true;
            clearInterval(intervalId);
            clearTimeout(timeoutId);
        };

        const timeoutId = setTimeout(() => {
            if (isFinalized) return;
            cleanup(intervalId, timeoutId);
            reject(new Error('Authentication timed out. Please try again.'));
        }, timeout);

        const intervalId = setInterval(async () => {
            if (isFinalized) return;
            try {
                const response = await fetch(checkUrl);
                if (response.ok) {
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
                } else if (response.status !== 404) {
                    const errorText = await response.text().catch(() => 'Server returned an unreadable error.');
                    throw new Error(`Auth service failed with status ${response.status}: ${errorText}`);
                }
            } catch (error) {
                const detail = (error instanceof Error) ? `${error.name}: ${error.message}` : 'Unknown error';
                const friendlyError = new Error(`Polling for auth token failed. This could be a local network issue (firewall, VPN) or a server problem.\n  Underlying error: ${detail}`);
                cleanup(intervalId, timeoutId);
                reject(friendlyError);

            }
        }, pollInterval);

        try {
            console.log(chalk.cyan('\n🌐 Opening browser for Spotify authentication...'));
            console.log(chalk.gray("If the browser doesn't open, please visit this URL:"));
            console.log(chalk.blue(loginUrl));
            console.log(chalk.gray('\nWaiting for you to complete authentication in your browser...\n'));
            await open(loginUrl);
        } catch (error) {
            console.log(chalk.yellow('\n⚠️  Could not open browser automatically. Please manually open this URL:'));
            console.log(chalk.blue(loginUrl));
        }
    });
}

export function getConfigPath(): string {
    return configPath;
}

export async function resetConfig(): Promise<void> {
    try {
        if (await fs.pathExists(configPath)) {
            await fs.remove(configPath);
        }
    } catch (error) {
        console.error('Failed to reset configuration:', error);
    }
}