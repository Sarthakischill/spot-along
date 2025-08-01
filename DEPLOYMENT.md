# Deployment Guide for ListenAlong

This guide will help you deploy both the main server and authentication service to Cloudflare Workers.

## Prerequisites

1. **Cloudflare Account**: Sign up at [cloudflare.com](https://cloudflare.com)
2. **Wrangler CLI**: Install with `npm install -g wrangler`
3. **Spotify Developer Account**: Create at [developer.spotify.com](https://developer.spotify.com)

## Step 1: Spotify App Setup

1. Go to [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
2. Click "Create App"
3. Fill in the details:
   - **App name**: `ListenAlong Auth`
   - **App description**: `Authentication service for ListenAlong CLI`
   - **Website**: `https://your-domain.com` (can be any valid URL)
   - **Redirect URI**: `https://your-auth-service.your-subdomain.workers.dev/callback`
4. Save the **Client ID** and **Client Secret**

## Step 2: Deploy Main Server

The main server handles WebSocket connections and room management.

```bash
# In the root directory
npm install
npm run deploy
```

This will deploy to `spot-along-server.your-subdomain.workers.dev`

## Step 3: Deploy Authentication Service

### 3.1 Create KV Namespace

The authentication service needs a KV namespace to temporarily store tokens during the OAuth flow.

```bash
# Navigate to auth-server directory
cd auth-server

# Create the main KV namespace
npx wrangler kv:namespace create TOKEN_STORE

# Create the preview KV namespace (for development)
npx wrangler kv:namespace create TOKEN_STORE --preview
```

You'll see output like this:
```
🌀 Creating namespace with title "spot-along-auth-TOKEN_STORE"
✨ Success!
Add the following to your configuration file:
id = "abc123def456ghi789jkl012mno345pqr678stu901vwx234yz"
```

### 3.2 Update Configuration

Edit `auth-server/wrangler.toml` and replace the placeholder IDs:

```toml
[[kv_namespaces]]
binding = "TOKEN_STORE"
id = "abc123def456ghi789jkl012mno345pqr678stu901vwx234yz"  # Your main namespace ID
preview_id = "def456ghi789jkl012mno345pqr678stu901vwx234yzabc123"  # Your preview namespace ID
```

### 3.3 Set Environment Variables

Set your Spotify credentials as secrets:

```bash
# Set the main credentials
npx wrangler secret put SPOTIFY_CLIENT_ID
# Enter your Spotify Client ID when prompted

npx wrangler secret put SPOTIFY_CLIENT_SECRET
# Enter your Spotify Client Secret when prompted
```

### 3.4 Deploy the Auth Service

```bash
npm run deploy
```

This will deploy to `spot-along-auth.your-subdomain.workers.dev`

## Step 4: Update Client Configuration

Update the authentication service URL in `src/tokenManager.ts`:

```typescript
const AUTH_SERVICE_URL = 'https://spot-along-auth.your-subdomain.workers.dev';
```

## Step 5: Test the Deployment

1. **Test the main server**:
   ```bash
   curl https://spot-along-server.your-subdomain.workers.dev/health
   ```

2. **Test the auth service**:
   ```bash
   curl https://spot-along-auth.your-subdomain.workers.dev/health
   ```

3. **Test the complete flow**:
   ```bash
   npm start
   ```

## Troubleshooting

### Common Issues

**"KV namespace not found"**
- Ensure you've created both the main and preview KV namespaces
- Verify the IDs in `wrangler.toml` are correct
- Check that you're using the right account (if you have multiple Cloudflare accounts)

**"Authentication failed"**
- Verify your Spotify app credentials are set correctly
- Check that the redirect URI matches exactly
- Ensure the auth service URL is updated in `src/tokenManager.ts`

**"WebSocket connection failed"**
- Verify the main server is deployed and accessible
- Check that the server URL in `src/client.ts` is correct

### Debugging

Enable debug logging:

```bash
# For the main server
wrangler dev --log-level debug

# For the auth service
cd auth-server
wrangler dev --log-level debug
```

### Environment Variables

You can also set environment variables in the Cloudflare dashboard:

1. Go to Workers & Pages
2. Select your worker
3. Go to Settings → Variables
4. Add your secrets there

## Production Considerations

### Security
- Use environment variables for all secrets
- Regularly rotate your Spotify app credentials
- Monitor your Cloudflare usage

### Performance
- The free tier includes 100,000 requests/day
- KV operations count toward your usage
- Consider upgrading for high-traffic applications

### Monitoring
- Use Cloudflare Analytics to monitor usage
- Set up alerts for error rates
- Monitor KV namespace usage

## Support

If you encounter issues:

1. Check the [troubleshooting section](#troubleshooting)
2. Review the Cloudflare Workers logs
3. Verify all environment variables are set
4. Test with a fresh deployment

For additional help, please open an issue on GitHub. 