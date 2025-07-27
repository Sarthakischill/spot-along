# Spot-along Authentication Service

This is the centralized authentication service for the Spot-along CLI application. It handles Spotify OAuth flow and provides a secure way for users to authenticate without needing to set up their own Spotify apps.

## Setup

1. **Get Spotify API Credentials:**
   - Go to [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
   - Create a new app or use an existing one
   - Copy your Client ID and Client Secret

2. **Deploy to Cloudflare Workers:**
   ```bash
   # Install dependencies
   npm install
   
   # Login to Cloudflare
   npx wrangler login
   
   # Set environment variables
   npx wrangler secret put SPOTIFY_CLIENT_ID
   npx wrangler secret put SPOTIFY_CLIENT_SECRET
   
   # Deploy
   npm run deploy
   ```

3. **Configure Spotify App:**
   - Go back to your Spotify Developer Dashboard
   - Edit your app settings
   - Add the redirect URI: `https://spot-along-auth.sarthakshitole.workers.dev/callback`
   - Save the settings

## How It Works

1. User runs `npx spot-along`
2. CLI opens browser to `https://spot-along-auth.sarthakshitole.workers.dev/login`
3. User logs into Spotify and authorizes the app
4. Spotify redirects to `/callback` with an authorization code
5. Service exchanges code for access/refresh tokens
6. Service displays tokens in a user-friendly page
7. User copies tokens and pastes them into CLI
8. CLI saves tokens locally and continues

## Security

- No tokens are stored on the server
- Tokens are only displayed to the user once
- CORS is properly configured
- Environment variables are securely stored in Cloudflare Workers

## Development

```bash
# Run locally
npm run dev

# Deploy to staging
npx wrangler deploy --env staging
``` 