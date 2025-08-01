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
var __rest = (this && this.__rest) || function (s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
            if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                t[p[i]] = s[p[i]];
        }
    return t;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DurableObjectRoom = void 0;
// A helper function to get user info using native fetch
function getSpotifyUser(accessToken) {
    return __awaiter(this, void 0, void 0, function* () {
        const response = yield fetch("https://api.spotify.com/v1/me", {
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        });
        if (!response.ok) {
            // FIX: Improved error message
            throw new Error(`Failed to get Spotify user info: ${response.status} ${response.statusText}`);
        }
        return yield response.json();
    });
}
class DurableObjectRoom {
    constructor(state, env) {
        this.state = state;
        this.env = env;
        this.clients = new Map();
        this.roomId = "";
    }
    broadcast(message, exclude) {
        const messageString = JSON.stringify(message);
        this.clients.forEach((client, ws) => {
            if (ws !== exclude) {
                ws.send(messageString);
            }
        });
    }
    // Broadcasts the current room state (member list, host)
    broadcastRoomState() {
        return __awaiter(this, void 0, void 0, function* () {
            const hostId = yield this.state.storage.get("hostId");
            const payload = {
                hostId: hostId || '',
                members: Array.from(this.clients.values()).map(c => ({ id: c.id, username: c.username })),
            };
            this.broadcast({ type: 'room-state-update', payload });
        });
    }
    fetch(request) {
        return __awaiter(this, void 0, void 0, function* () {
            // A Durable Object's name is how we identify it. We'll use the room ID.
            const url = new URL(request.url);
            // Parse the room ID from the URL path set by index.ts (/room/connect/ROOMID)
            const pathSegments = url.pathname.split('/').filter(Boolean);
            this.roomId = pathSegments[2]; // Should be the room ID from /room/connect/ROOMID 
            // Upgrade the connection to a WebSocket
            const upgradeHeader = request.headers.get('Upgrade');
            if (!upgradeHeader || upgradeHeader !== 'websocket') {
                return new Response('Expected WebSocket upgrade', { status: 426 });
            }
            const pair = new WebSocketPair();
            const [client, server] = [pair[0], pair[1]];
            this.state.acceptWebSocket(server);
            return new Response(null, {
                status: 101,
                webSocket: client
            });
        });
    }
    // --- WebSocket Event Handlers for THIS room ---
    webSocketMessage(ws, message) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            try {
                const msg = JSON.parse(message);
                // Validate message structure
                if (!msg.type || !msg.payload) {
                    ws.send(JSON.stringify({ type: 'error', payload: { message: 'Invalid message format' } }));
                    return;
                }
                // Validate access token is present
                if (!msg.payload.accessToken) {
                    ws.send(JSON.stringify({ type: 'error', payload: { message: 'No access token provided' } }));
                    return;
                }
                const hostId = yield this.state.storage.get("hostId");
                // Get user info from Spotify
                let me;
                try {
                    me = yield getSpotifyUser(msg.payload.accessToken);
                }
                catch (error) {
                    let errorMsg = 'Invalid Spotify access token';
                    if (error instanceof Error) {
                        errorMsg = `Spotify API error: ${error.message}`;
                    }
                    ws.send(JSON.stringify({ type: 'error', payload: { message: errorMsg } }));
                    ws.close();
                    return;
                }
                const clientInfo = {
                    id: me.id,
                    username: me.display_name || me.id,
                    socket: ws
                };
                switch (msg.type) {
                    case 'create-room':
                        // Check if room already has a host
                        if (hostId) {
                            ws.send(JSON.stringify({
                                type: 'error',
                                payload: { message: `Room ${this.roomId} already exists with a different host.` }
                            }));
                            ws.close();
                            return;
                        }
                        // Check room capacity (max 10 members)
                        if (this.clients.size >= 10) {
                            ws.send(JSON.stringify({
                                type: 'error',
                                payload: { message: 'Room is full (maximum 10 members).' }
                            }));
                            ws.close();
                            return;
                        }
                        // Set this user as the host
                        yield this.state.storage.put("hostId", clientInfo.id);
                        this.clients.set(ws, clientInfo);
                        ws.send(JSON.stringify({
                            type: 'room-created',
                            payload: { roomId: this.roomId }
                        }));
                        yield this.broadcastRoomState();
                        break;
                    case 'join-room':
                        // Check if room exists (has a host)
                        if (!hostId) {
                            ws.send(JSON.stringify({
                                type: 'error',
                                payload: { message: `Room ${this.roomId} does not exist or has no host.` }
                            }));
                            ws.close();
                            return;
                        }
                        // Check room capacity
                        if (this.clients.size >= 10) {
                            ws.send(JSON.stringify({
                                type: 'error',
                                payload: { message: 'Room is full (maximum 10 members).' }
                            }));
                            ws.close();
                            return;
                        }
                        // Check if user is already in the room
                        const existingClient = Array.from(this.clients.values()).find(c => c.id === clientInfo.id);
                        if (existingClient) {
                            // Remove the old connection
                            const oldWs = (_a = Array.from(this.clients.entries()).find(([_, c]) => c.id === clientInfo.id)) === null || _a === void 0 ? void 0 : _a[0];
                            if (oldWs) {
                                this.clients.delete(oldWs);
                                oldWs.close();
                            }
                        }
                        this.clients.set(ws, clientInfo);
                        ws.send(JSON.stringify({
                            type: 'joined-room',
                            payload: { roomId: this.roomId }
                        }));
                        yield this.broadcastRoomState();
                        break;
                    case 'playback-state-update':
                        const currentClient = this.clients.get(ws);
                        // Only allow host to update playback state
                        if (currentClient && currentClient.id === hostId) {
                            // Validate playback state payload
                            const state = msg.payload;
                            if (state && typeof state.isPlaying === 'boolean' && state.timestamp) {
                                // Remove accessToken from the state before broadcasting
                                const { accessToken } = state, playbackState = __rest(state, ["accessToken"]);
                                this.broadcast({ type: 'force-sync', payload: playbackState }, ws);
                            }
                        }
                        else {
                            ws.send(JSON.stringify({
                                type: 'error',
                                payload: { message: 'Only the host can update playback state.' }
                            }));
                        }
                        break;
                    default:
                        ws.send(JSON.stringify({
                            type: 'error',
                            payload: { message: `Unknown message type: ${msg.type}` }
                        }));
                }
            }
            catch (error) {
                let errorMessage = "An internal server error occurred.";
                if (error instanceof Error) {
                    errorMessage = error.message;
                }
                try {
                    ws.send(JSON.stringify({ type: 'error', payload: { message: errorMessage } }));
                }
                catch (sendError) {
                    // Failed to send error message
                }
                ws.close();
            }
        });
    }
    webSocketClose(ws, code, reason, wasClean) {
        return __awaiter(this, void 0, void 0, function* () {
            const client = this.clients.get(ws);
            if (client) {
                this.clients.delete(ws);
                // If the host left, clean up the room
                const hostId = yield this.state.storage.get("hostId");
                if (client.id === hostId) {
                    // Host left - clean up the room
                    yield this.state.storage.delete("hostId");
                    // Notify all remaining clients that the room is closing
                    this.broadcast({
                        type: 'error',
                        payload: { message: 'Host left the room. Room is now closed.' }
                    });
                    // Close all remaining connections
                    this.clients.forEach((_, clientWs) => {
                        clientWs.close();
                    });
                    this.clients.clear();
                }
                else {
                    // Regular member left - just update room state
                    yield this.broadcastRoomState();
                }
            }
        });
    }
    webSocketError(ws, error) {
        return __awaiter(this, void 0, void 0, function* () {
            const client = this.clients.get(ws);
            if (client) {
                this.clients.delete(ws);
                // Check if it was the host and handle accordingly
                const hostId = yield this.state.storage.get("hostId");
                if (client.id === hostId) {
                    yield this.state.storage.delete("hostId");
                    this.broadcast({
                        type: 'error',
                        payload: { message: 'Host connection lost. Room is now closed.' }
                    });
                    this.clients.forEach((_, clientWs) => {
                        clientWs.close();
                    });
                    this.clients.clear();
                }
                else {
                    yield this.broadcastRoomState();
                }
            }
        });
    }
}
exports.DurableObjectRoom = DurableObjectRoom;
