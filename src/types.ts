export interface WebSocketMessage {
  type: string;
  payload: any;
}

// We can also define specific payload structures for clarity
export interface CreateRoomPayload {
  // No payload needed for creating a room
}

export interface JoinRoomPayload {
  roomId: string;
}

export interface RoomCreatedPayload {
  roomId: string;
}

export interface UserJoinedPayload {
  clientId: string;
}

export interface ErrorPayload {
  message: string;
}

// Now includes all the data we need for a rich UI
export interface PlaybackStatePayload {
  trackName: string;
  artistName: string;
  trackUri: string;
  durationMs: number;
  positionMs: number;
  isPlaying: boolean;
  timestamp: number;
}

// New interface for room state updates
export interface RoomStatePayload {
  hostId: string;
  members: {
    id: string;
    username: string;
  }[];
} 