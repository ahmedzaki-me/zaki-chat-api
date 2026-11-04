import type { Server } from "socket.io";

export const OWNER_ROOM = "owner";
export const userRoom = (userId: string) => `user:${userId}`;
export const sessionRoom = (sessionId: string) => `session:${sessionId}`;

export function hasConnectedSockets(io: Server, room: string) {
  return (io.sockets.adapter.rooms.get(room)?.size ?? 0) > 0;
}
