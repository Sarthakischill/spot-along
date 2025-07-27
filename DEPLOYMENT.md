# Spot-along Deployment Guide

This guide will walk you through deploying both the main application and the authentication service to make Spot-along publicly available.

## Prerequisites

1. **Cloudflare Account**: Sign up at [cloudflare.com](https://cloudflare.com)
2. **Spotify Developer Account**: Create an app at [developer.spotify.com](https://developer.spotify.com/dashboard)
3. **Node.js**: Version 16 or later

## Step 1: Deploy the Authentication Service

The authentication service handles Spotify OAuth flow for all users.

### 1.1 Set Up Spotify App

1. Go to [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
2. Create a new app or use an existing one
3. Note your **Client ID** and **Client Secret**
4. Click "Edit Settings"
5. Add redirect URI: `https://spot-along-auth.sarthakshitole.workers.dev/callback`
6. Save settings

### 1.2 Deploy Auth Service

```bash
# Navigate to auth server directory
cd auth-server

# Install dependencies
npm install

# Login to Cloudflare
npx wrangler login

# Set environment variables (you'll be prompted for values)
npx wrangler secret put SPOTIFY_CLIENT_ID
npx wrangler secret put SPOTIFY_CLIENT_SECRET

# Deploy
npm run deploy
```

### 1.3 Verify Auth Service

Visit `https://spot-along-auth.sarthakshitole.workers.dev/login` - it should redirect to Spotify.

## Step 2: Deploy the Main Application

The main application handles room management and WebSocket connections.

### 2.1 Deploy Main Worker

```bash
# Navigate back to main directory
cd ..

# Install dependencies (if not already done)
npm install

# Deploy main worker
npm run deploy
```

### 2.2 Verify Main Application

The main worker should be available at `https://spot-along-server.sarthakshitole.workers.dev`

## Step 3: Test the Complete System

### 3.1 Test Authentication Flow

1. Run `npx spot-along` (or `npm start` if testing locally)
2. Press `c` to create a room
3. Browser should open to auth service
4. Complete Spotify login
5. Copy tokens from success page
6. Paste into terminal
7. Verify you're in a room

### 3.2 Test Room Functionality

1. Open another terminal
2. Run `npx spot-along` again
3. Press `j` to join
4. Enter the room ID from step 1
5. Verify both users are in the same room

## Step 4: Publish to NPM

Once everything is working:

```bash
# Build the application
npm run build

# Publish to NPM
npm publish
```

## Troubleshooting

### Auth Service Issues

- **"Invalid client" error**: Check that redirect URI in Spotify dashboard matches exactly
- **Environment variables not found**: Ensure secrets are set with `wrangler secret put`
- **CORS errors**: Check that CORS headers are properly configured

### Main Application Issues

- **WebSocket connection failed**: Check that Durable Objects are properly configured
- **Room creation fails**: Verify the main worker is deployed and accessible
- **Host assignment issues**: Check Durable Object storage configuration

### General Issues

- **"Premium required" error**: Ensure user has Spotify Premium account
- **Token refresh fails**: Check that refresh tokens are being saved correctly
- **Connection timeouts**: Verify both workers are deployed and accessible

## Security Considerations

1. **Environment Variables**: Never commit secrets to git
2. **CORS**: Properly configured for production domains
3. **Token Storage**: Tokens are only stored locally on user machines
4. **HTTPS**: All communication uses secure connections

## Monitoring

- Use Cloudflare Workers analytics to monitor usage
- Check Cloudflare Workers logs for errors
- Monitor Spotify API rate limits

## Scaling

The application automatically scales with Cloudflare Workers:
- Each room is a separate Durable Object
- WebSocket connections are handled efficiently
- No server management required

## Support

For issues or questions:
- Check the main README.md for usage instructions
- Review this deployment guide for setup issues
- Check Cloudflare Workers documentation for platform-specific issues 