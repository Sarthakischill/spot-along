# SpotAlong 🎵

Real-time Spotify listening parties, right in your terminal. Sync your Spotify playback with friends and enjoy music together! [Inivite only for now, as spotify does not allow individuals to get out of developer mode]

## ✨ Features

- **Real-time Sync**: Host a room and sync your Spotify playback with friends
- **Cross-platform**: Works on Windows, macOS, and Linux
- **Simple Setup**: One-time authentication with Spotify
- **Beautiful TUI**: Clean, intuitive terminal interface
- **Premium Required**: Uses Spotify's Premium features for seamless control

## 🚀 Quick Start

### Prerequisites

- **Spotify Premium Account** (required for playback control)
- **Node.js 18+** and npm
- **Cloudflare Account** (for hosting the backend services)

### Installation

```bash
npm install -g spotalong
```

### First-Time Setup

1. **Deploy the Backend Services** (see [Deployment Guide](#deployment-guide) below)
2. **Run the app**: `spotalong`
3. **Authenticate with Spotify** when prompted
4. **Create or join a room** and start listening!

## 🛠️ Deployment Guide

### Step 1: Deploy the Main Server

The main server handles WebSocket connections and room management.

```bash
# In the root directory
npm run deploy
```

### Step 2: Deploy the Authentication Service

The authentication service handles Spotify OAuth2 flow.

```bash
# Navigate to auth-server directory
cd auth-server

# Create KV namespace for token storage
npx wrangler kv:namespace create TOKEN_STORE
npx wrangler kv:namespace create TOKEN_STORE --preview

# Update wrangler.toml with the returned IDs
# Replace the placeholder IDs in auth-server/wrangler.toml:
# - id = "REPLACE_WITH_YOUR_KV_NAMESPACE_ID"
# - preview_id = "REPLACE_WITH_YOUR_KV_NAMESPACE_PREVIEW_ID"

# Deploy the auth service
npm run deploy
```

### Step 3: Update Configuration

After deployment, update the authentication service URL in `src/tokenManager.ts`:

```typescript
const AUTH_SERVICE_URL = 'https://your-auth-service.your-subdomain.workers.dev';
```

## 🎮 Usage

### Creating a Room
- Press `c` to create a new room
- Share the room ID with your friends
- Start playing music on Spotify

### Joining a Room
- Press `j` to join an existing room
- Enter the room ID provided by the host
- Your Spotify will sync to the host's playback

### Controls
- `q` - Quit/Leave room
- `h` - Show help
- `r` - Reset configuration (in help menu)

## 🔧 Troubleshooting

### Common Issues

**"Authentication failed: [object Object]"**
- This was a critical bug that has been fixed in version 1.2.1
- If you're still experiencing this, try resetting your configuration (`h` → `r`)

**"Room doesn't exist" or "Connection failed"**
- Ensure both backend services are properly deployed
- Check that the authentication service URL is correct in `src/tokenManager.ts`

**"Premium account required"**
- This app requires Spotify Premium for playback control features
- Free accounts cannot control playback and will not work

### Reset Configuration

If you encounter authentication issues:

1. Press `h` for help menu
2. Press `r` to reset configuration
3. Restart the app and re-authenticate

## 🏗️ Architecture

- **CLI Client** (`src/client.ts`): Terminal UI and Spotify API integration
- **Main Server** (`src/index.ts`): WebSocket server and room management
- **Durable Objects** (`src/DurableObjectRoom.ts`): Stateful room instances
- **Auth Service** (`auth-server/`): Spotify OAuth2 flow handler

## 📝 Recent Fixes (v1.2.1)

### Critical Authentication Fixes
- **Fixed "[object Object]" error**: Improved error handling to prevent cryptic error messages
- **KV Namespace Configuration**: Added proper placeholder IDs that need to be replaced with actual Cloudflare KV Namespace IDs
- **Better Error Messages**: More descriptive error messages for easier debugging
- **Token Refresh Logic**: Improved handling of expired access tokens

### Code Quality Improvements
- **Removed Unused Dependencies**: Cleaned up auth-server dependencies
- **Better Error Handling**: Consistent error handling across all components
- **Improved Documentation**: Clear deployment instructions and troubleshooting guide

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## 📄 License

MIT License - see [LICENSE](LICENSE) for details.

## 🙏 Acknowledgments

- Spotify Web API for music integration
- Cloudflare Workers for serverless hosting
- The open-source community for various dependencies

---

**Happy Listening! 🎵**
