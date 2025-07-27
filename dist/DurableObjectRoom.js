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
            throw new Error(`Failed to get Spotify user info: ${response.statusText}`);
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
            // FIX: Correctly parse the room ID from the URL path set by index.ts
            this.roomId = url.pathname.split('/')[2];
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
    onWebSocketMessage(ws, message) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const msg = JSON.parse(message);
                const hostId = yield this.state.storage.get("hostId");
                // FIX: Use our new native fetch helper instead of the incompatible library
                const me = yield getSpotifyUser(msg.payload.accessToken);
                const clientInfo = { id: me.id, username: me.display_name || me.id, socket: ws };
                switch (msg.type) {
                    case 'create-room':
                        if (hostId) {
                            ws.send(JSON.stringify({ type: 'error', payload: { message: `Room ${this.roomId} already exists.` } }));
                            ws.close();
                            return;
                        }
                        yield this.state.storage.put("hostId", clientInfo.id);
                        this.clients.set(ws, clientInfo);
                        ws.send(JSON.stringify({ type: 'room-created', payload: { roomId: this.roomId } }));
                        yield this.broadcastRoomState();
                        break;
                    case 'join-room':
                        if (!hostId) {
                            ws.send(JSON.stringify({ type: 'error', payload: { message: `Room ${this.roomId} does not exist.` } }));
                            ws.close();
                            return;
                        }
                        this.clients.set(ws, clientInfo);
                        ws.send(JSON.stringify({ type: 'joined-room', payload: { roomId: this.roomId } }));
                        yield this.broadcastRoomState();
                        break;
                    case 'playback-state-update':
                        const currentClient = this.clients.get(ws);
                        if (currentClient && currentClient.id === hostId) {
                            this.broadcast({ type: 'force-sync', payload: msg.payload }, ws);
                        }
                        break;
                    default:
                        ws.send(JSON.stringify({ type: 'error', payload: { message: `Unknown message type: ${msg.type}` } }));
                }
            }
            catch (error) {
                let errorMessage = "An internal error occurred.";
                if (error instanceof Error)
                    errorMessage = error.message;
                ws.send(JSON.stringify({ type: 'error', payload: { message: errorMessage } }));
                ws.close();
            }
        });
    }
    onWebSocketClose(ws, code, reason, wasClean) {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.clients.has(ws)) {
                this.clients.delete(ws);
                yield this.broadcastRoomState();
            }
        });
    }
    onWebSocketError(ws, error) {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.clients.has(ws)) {
                this.clients.delete(ws);
                yield this.broadcastRoomState();
            }
        });
    }
}
exports.DurableObjectRoom = DurableObjectRoom;
