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
const DurableObjectRoom_1 = require("./DurableObjectRoom");
Object.defineProperty(exports, "DurableObjectRoom", { enumerable: true, get: function () { return DurableObjectRoom_1.DurableObjectRoom; } });
// This is the stateless "front door" worker.
exports.default = {
    fetch(request, env, ctx) {
        return __awaiter(this, void 0, void 0, function* () {
            const url = new URL(request.url);
            const path = url.pathname;
            // We'll use URLs like /room/create or /room/join/<id>
            const pathSegments = path.split('/').filter(Boolean);
            if (pathSegments.length < 2 || pathSegments[0] !== 'room') {
                return new Response('Invalid request. Use /room/create or /room/join/<roomId>', { status: 400 });
            }
            let roomId;
            const action = pathSegments[1];
            // Handle creating a new room
            if (action === 'create') {
                roomId = Math.random().toString(36).substring(2, 8).toUpperCase();
            }
            else if (action === 'join' && pathSegments[2]) {
                roomId = pathSegments[2].toUpperCase();
            }
            else {
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
        });
    }
};
