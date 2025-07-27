# 🎵 ListenAlong

### Real-time Spotify listening parties, right in your terminal.

A command-line tool that lets you create shared, synchronized music sessions with friends, inspired by Discord's "Listen Along" feature. The host controls the music using their regular Spotify app (desktop or mobile), and everyone else's player syncs up in real-time.

**🚀 Now powered by Cloudflare Workers for global, low-latency performance!**

---

## ✨ Features

*   **Real-Time Sync:** Music playback is synchronized between the host and all listeners.
*   **Polished Terminal UI:** A clean, flicker-free interface that shows the current song, artist, and a live progress bar.
*   **Persistent & Secure Auth:** Log in once! The app securely saves and refreshes your Spotify credentials so you don't have to log in with your browser every time.
*   **Host & Listener Model:** One person acts as the host, and up to 9 others can join as listeners. The member list shows who's in the room and who's hosting.
*   **Cross-Platform:** Works on Windows, macOS, and Linux.
*   **Intuitive Controls:** Simple, single-key navigation for creating rooms and accessing settings.
*   **Built-in Settings:** An easy-to-use help screen shows you where your configuration is stored and allows for a one-key reset.
*   **Global Infrastructure:** Built on Cloudflare Workers for worldwide access with minimal latency.
*   **Zero Setup for Users:** No need to create Spotify apps or configure environment variables - just run and go!

## ✅ Prerequisites

Before you begin, you will need two things:

1.  **Node.js:** You must have Node.js (version 16 or later) installed on your system. You can download it from [nodejs.org](https://nodejs.org/).
2.  **Spotify Premium Account:** The Spotify Web API requires a **Premium** account to control playback remotely. This tool will not work with a free Spotify account. All users (both host and listeners) must have a Premium subscription.

## 🚀 Usage

The easiest way to use Spot-along is with `npx`, which will run the package without needing a permanent installation.

```bash
npx spot-along
```

The first time you run this, your web browser will open to the Spotify login page. After you approve the permissions, Spot-along will handle the rest. On subsequent runs, it will use your saved tokens and you won't need to log in again.

### Controls

Once the application is running, use these single-key commands:

| Key | Action                                       | Availability      |
|:---:|----------------------------------------------|-------------------|
| `c` | **Create** a new listening room and become the host. | Main Menu         |
| `j` | **Join** an existing room using a Room ID.         | Main Menu         |
| `h` | Open the **Help & Settings** screen.           | Main Menu         |
| `r` | **Reset** your configuration (deletes saved tokens). | Help & Settings   |
| `b` | Go **Back** to the Main Menu.                | Help & Settings   |
| `q` | **Quit** the application.                      | Any Screen        |

---

## 🛠️ Development Setup

Interested in contributing or running the project from the source code? Follow these steps.

### 1. Clone the Repository
```bash
git clone https://github.com/Sarthakischill/spot-along.git
cd spot-along
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Set Up Your Spotify API Credentials (For Development Only)

**Note:** For end users, no setup is required! The application uses a centralized authentication service.

If you're developing or want to run the authentication service locally:

1.  Go to the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard) and log in.
2.  Click **"Create app"**.
3.  Give it a name (e.g., "Spot-along Dev") and a description.
4.  Once created, copy your **Client ID** and **Client Secret**.
5.  Click **"Edit Settings"**.
6.  In the "Redirect URIs" box, add this exact URL: `http://localhost:8888/callback`
7.  Click **"Add"** and then **"Save"**.

### 4. Create Your Environment File (For Development Only)

In the root of the project, create a file named `.env` and populate it with the credentials you just copied.

**.env**
```
SPOTIFY_CLIENT_ID=your_client_id_from_the_dashboard
SPOTIFY_CLIENT_SECRET=your_client_secret_from_the_dashboard
REDIRECT_URI=http://localhost:8888/callback
```

### 5. Running the Application Locally

The project now uses Cloudflare Workers for the server component. You can run it locally for development.

*   **For local development, run the worker locally:**
    ```bash
    npm run dev
    ```
    This starts a local Cloudflare Worker at `localhost:8787`.

*   **In a separate terminal, run the client:**
    ```bash
    npm start
    ```

*   **For production deployment:**
    ```bash
    npm run deploy
    ```
    This deploys the worker to Cloudflare and makes it available globally.

### 6. Authentication Service (Optional)

If you want to run your own authentication service instead of using the public one:

1. Navigate to the `auth-server` directory
2. Follow the setup instructions in `auth-server/README.md`
3. Update the `AUTH_SERVICE_URL` in `src/tokenManager.ts` to point to your service

## 🏗️ Project Structure

A brief overview of the key files in the project:

*   `src/client.ts`: The main entry point for the user-facing terminal application. It handles keypresses, orchestrates API calls, and manages the main application state.
*   `src/index.ts`: The Cloudflare Worker entrypoint that routes requests to the appropriate Durable Object.
*   `src/DurableObjectRoom.ts`: The stateful room management system using Cloudflare Durable Objects. Each room is a separate Durable Object instance.
*   `src/uiManager.ts`: The dedicated rendering engine. It's responsible for drawing the entire user interface without flicker, using `log-update`.
*   `src/tokenManager.ts`: Handles all logic related to Spotify authentication—saving, loading, refreshing, and validating tokens.
*   `src/types.ts`: Defines shared TypeScript interfaces for messages and data payloads, ensuring type safety between the client and server.

---

## 🔧 Recent Fixes (v1.0.1)

This version includes major improvements to fix reliability issues:

*   **Fixed Host Assignment:** The first person to create a room is now properly assigned as the host, with persistent storage.
*   **Improved Client-Server Communication:** Added proper message handling for room creation and joining.
*   **Enhanced Error Handling:** Better error messages and connection recovery.
*   **Updated Architecture:** Migrated to Cloudflare Workers with Durable Objects for better scalability and reliability.
*   **Fixed Join Room Prompt:** The room joining process now works correctly without UI glitches.
*   **Centralized Authentication:** Users no longer need to create their own Spotify apps or handle environment variables.

---

## ❤️ Author

Made with ♥ by **Sarthak**
*   **X.com / Twitter:** [x.com/Sarthakhuh](https://x.com/Sarthakhuh)
*   **GitHub:** [@Sarthakischill](https://github.com/Sarthakischill)

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE)