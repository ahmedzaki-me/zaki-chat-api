import type { Socket } from "socket.io";

export type SocketViewState = { visible: boolean; activeConversationId: string | null };
const views = new Map<string, { userId: string; state: SocketViewState }>();

export function registerConnection(socket: Socket, userId: string) {
  views.set(socket.id, { userId, state: { visible: false, activeConversationId: null } });
}
export function updateSocketView(socketId: string, state: SocketViewState) {
  const entry = views.get(socketId);
  if (entry) entry.state = state;
}
export function removeConnection(socketId: string) { views.delete(socketId); }
export function isUserViewingConversation(userId: string, conversationId: string) {
  return [...views.values()].some(({ userId: id, state }) => id === userId && state.visible && state.activeConversationId === conversationId);
}
export function isUserVisible(userId: string) {
  return [...views.values()].some(({ userId: id, state }) => id === userId && state.visible);
}
