import { DurableObjectRoom, Env } from './DurableObjectRoom';

// Cloudflare Workers types
declare global {
    interface ExecutionContext {
        waitUntil(promise: Promise<any>): void;
        passThroughOnException(): void;
    }
}

// This is the stateless "front door" worker.
export default {
    async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
        const url = new URL(request.url);
        const path = url.pathname;

        // We'll use URLs like /room/create or /room/join/<id>
        const pathSegments = path.split('/').filter(Boolean);

        if (pathSegments.length < 2 || pathSegments[0] !== 'room') {
            return new Response('Invalid request. Use /room/create or /room/join/<roomId>', { status: 400 });
        }

        let roomId: string;
        const action = pathSegments[1];

        // Handle creating a new room
        if (action === 'create') {
            roomId = Math.random().toString(36).substring(2, 8).toUpperCase();
        } else if (action === 'join' && pathSegments[2]) {
            roomId = pathSegments[2].toUpperCase();
        } else {
            return new Response('Invalid request path. Use /room/create or /room/join/<roomId>', { status: 400 });
        }

        // This is the core logic. Get a "stub" for the Durable Object.
        // Cloudflare ensures that all requests for the SAME roomId go to the SAME object instance.
        const doId = env.ROOM.idFromName(roomId);
        const roomObject = env.ROOM.get(doId);

        // FIX: The original code did not correctly forward the request.
        // We create a new URL that includes the room ID for the DO to read and pass it in a new Request object.
        // This ensures the Durable Object knows its own ID and can distinguish between create/join actions.
        const newUrl = new URL(request.url);
        newUrl.pathname = `/room/connect/${roomId}`;
        
        // Forward the user's request to the correct Durable Object instance
        return roomObject.fetch(new Request(newUrl, request));
    }
};

// Re-export the DO class so wrangler can find it from the main entrypoint
export { DurableObjectRoom }; 