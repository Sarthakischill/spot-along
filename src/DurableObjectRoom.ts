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
        delete(key: string): Promise<boolean>;
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
        // FIX: Improved error message
        throw new Error(`Failed to get Spotify user info: ${response.status} ${response.statusText}`);
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
        } as any);
    }
    // --- WebSocket Event Handlers for THIS room ---
    async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
        try {
            const msg: WebSocketMessage = JSON.parse(message as string);
            
            // Validate message structure
            if (!msg.type || !msg.payload) {
                ws.send(JSON.stringify({ type: 'error', payload: { message: 'Invalid message format' }}));
                return;
            }
            
            // Validate access token is present
            if (!msg.payload.accessToken) {
                ws.send(JSON.stringify({ type: 'error', payload: { message: 'No access token provided' }}));
                return;
            }

            const hostId = await this.state.storage.get<string>("hostId");
            
            // Get user info from Spotify
            let me;
            try {
                me = await getSpotifyUser(msg.payload.accessToken);
            } catch (error) {
                let errorMsg = 'Invalid Spotify access token';
                if (error instanceof Error) {
                    errorMsg = `Spotify API error: ${error.message}`;
                }
                ws.send(JSON.stringify({ type: 'error', payload: { message: errorMsg }}));
                ws.close();
                return;
            }
            
            const clientInfo: Client = { 
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
                    await this.state.storage.put("hostId", clientInfo.id);
                    this.clients.set(ws, clientInfo);
                    
                    ws.send(JSON.stringify({ 
                        type: 'room-created', 
                        payload: { roomId: this.roomId } 
                    }));
                    
                    await this.broadcastRoomState();
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
                        const oldWs = Array.from(this.clients.entries()).find(([_, c]) => c.id === clientInfo.id)?.[0];
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
                    
                    await this.broadcastRoomState();
                    break;

                case 'playback-state-update':
                    const currentClient = this.clients.get(ws);
                    
                    // Only allow host to update playback state
                    if (currentClient && currentClient.id === hostId) {
                        // Validate playback state payload
                        const state = msg.payload;
                        if (state && typeof state.isPlaying === 'boolean' && state.timestamp) {
                            // Remove accessToken from the state before broadcasting
                            const { accessToken, ...playbackState } = state;
                            this.broadcast({ type: 'force-sync', payload: playbackState }, ws);
                        }
                    } else {
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
        } catch (error) {
            let errorMessage = "An internal server error occurred.";
            if (error instanceof Error) {
                errorMessage = error.message;
            }
            
            try {
                ws.send(JSON.stringify({ type: 'error', payload: { message: errorMessage }}));
            } catch (sendError) {
                // Failed to send error message
            }
            
            ws.close();
        }
    }

    async webSocketClose(ws: WebSocket, code: number, reason: string, wasClean: boolean) {
        const client = this.clients.get(ws);
        if (client) {
            this.clients.delete(ws);
            
            // If the host left, clean up the room
            const hostId = await this.state.storage.get<string>("hostId");
            if (client.id === hostId) {
                // Host left - clean up the room
                await this.state.storage.delete("hostId");
                
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
            } else {
                // Regular member left - just update room state
                await this.broadcastRoomState();
            }
        }
    }
    
    async webSocketError(ws: WebSocket, error: Error) {
        const client = this.clients.get(ws);
        if (client) {
            this.clients.delete(ws);
            
            // Check if it was the host and handle accordingly
            const hostId = await this.state.storage.get<string>("hostId");
            if (client.id === hostId) {
                await this.state.storage.delete("hostId");
                this.broadcast({ 
                    type: 'error', 
                    payload: { message: 'Host connection lost. Room is now closed.' }
                });
                this.clients.forEach((_, clientWs) => {
                    clientWs.close();
                });
                this.clients.clear();
            } else {
                await this.broadcastRoomState();
            }
        }
    }
}