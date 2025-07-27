import { WebSocketMessage, RoomStatePayload } from './types';

// NOTE: All "spotify-web-api-node" imports are GONE.

// (Keep the Cloudflare Workers type declarations as they were)
declare global {
    interface DurableObjectState {
        acceptWebSocket(ws: WebSocket): void;
        storage: DurableObjectStorage;
    }
    interface DurableObjectStorage {
        get<T>(key: string): Promise<T | undefined>;
        put<T>(key: string, value: T): Promise<void>;
    }
    interface DurableObjectNamespace { idFromName(name: string): DurableObjectId; get(id: DurableObjectId): DurableObjectStub; }
    interface DurableObjectId { toString(): string; }
    interface DurableObjectStub { fetch(request: Request): Promise<Response>; }
    interface WebSocketPair { [0]: WebSocket; [1]: WebSocket; }
    var WebSocketPair: { new(): WebSocketPair; };
}

interface Client {
    id: string; // Spotify User ID
    username: string;
    socket: WebSocket;
}

export interface Env {
    ROOM: DurableObjectNamespace;
}

// A helper function to get user info using native fetch
async function getSpotifyUser(accessToken: string): Promise<{ id: string, display_name: string }> {
    const response = await fetch("https://api.spotify.com/v1/me", {
        headers: {
            'Authorization': `Bearer ${accessToken}`
        }
    });
    if (!response.ok) {
        throw new Error(`Failed to get Spotify user info: ${response.statusText}`);
    }
    return await response.json();
}


export class DurableObjectRoom {
    state: DurableObjectState;
    env: Env;
    clients: Map<WebSocket, Client>;
    roomId: string;

    constructor(state: DurableObjectState, env: Env) {
        this.state = state;
        this.env = env;
        this.clients = new Map();
        this.roomId = "";
    }

    broadcast(message: WebSocketMessage, exclude?: WebSocket) {
        const messageString = JSON.stringify(message);
        this.clients.forEach((client, ws) => {
            if (ws !== exclude) {
                ws.send(messageString);
            }
        });
    }

    // Broadcasts the current room state (member list, host)
    async broadcastRoomState() {
        const hostId = await this.state.storage.get<string>("hostId");
        const payload: RoomStatePayload = {
            hostId: hostId || '',
            members: Array.from(this.clients.values()).map(c => ({ id: c.id, username: c.username })),
        };
        this.broadcast({ type: 'room-state-update', payload });
    }

    async fetch(request: Request) {
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
        } as any);
    }
    // --- WebSocket Event Handlers for THIS room ---
    async onWebSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
        try {
            const msg: WebSocketMessage = JSON.parse(message as string);
            const hostId = await this.state.storage.get<string>("hostId");
            
            // FIX: Use our new native fetch helper instead of the incompatible library
            const me = await getSpotifyUser(msg.payload.accessToken);
            const clientInfo: Client = { id: me.id, username: me.display_name || me.id, socket: ws };

            switch (msg.type) {
                case 'create-room':
                    if (hostId) {
                        ws.send(JSON.stringify({ type: 'error', payload: { message: `Room ${this.roomId} already exists.` }}));
                        ws.close();
                        return;
                    }
                    await this.state.storage.put("hostId", clientInfo.id);
                    this.clients.set(ws, clientInfo);
                    ws.send(JSON.stringify({ type: 'room-created', payload: { roomId: this.roomId } }));
                    await this.broadcastRoomState();
                    break;
                
                case 'join-room':
                    if (!hostId) {
                        ws.send(JSON.stringify({ type: 'error', payload: { message: `Room ${this.roomId} does not exist.` }}));
                        ws.close();
                        return;
                    }
                    this.clients.set(ws, clientInfo);
                    ws.send(JSON.stringify({ type: 'joined-room', payload: { roomId: this.roomId } }));
                    await this.broadcastRoomState();
                    break;

                case 'playback-state-update':
                    const currentClient = this.clients.get(ws);
                    if (currentClient && currentClient.id === hostId) {
                        this.broadcast({ type: 'force-sync', payload: msg.payload }, ws);
                    }
                    break;

                default:
                     ws.send(JSON.stringify({ type: 'error', payload: { message: `Unknown message type: ${msg.type}` }}));
            }
        } catch (error) {
            let errorMessage = "An internal error occurred.";
            if (error instanceof Error) errorMessage = error.message;
            ws.send(JSON.stringify({ type: 'error', payload: { message: errorMessage }}));
            ws.close();
        }
    }

    async onWebSocketClose(ws: WebSocket, code: number, reason: string, wasClean: boolean) {
        if (this.clients.has(ws)) {
            this.clients.delete(ws);
            await this.broadcastRoomState();
        }
    }
    
    async onWebSocketError(ws: WebSocket, error: Error) {
        if (this.clients.has(ws)) {
            this.clients.delete(ws);
            await this.broadcastRoomState();
        }
    }
}