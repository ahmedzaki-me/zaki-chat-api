import { EventEmitter } from "node:events";
import type { MessageDoc } from "../modules/messages/services/message.service.ts";

// Domain events: actions announce what happened, the publisher broadcasts it.
type RealtimeEvents = {
  "message.created": [message: MessageDoc];
  "message.updated": [message: MessageDoc]; // edit, soft delete
  "message.reacted": [message: MessageDoc];
  "message.deleted": [ref: { id: string; conversationId: string }];
  "conversation.cleared": [conversationId: string];
  "conversation.updated": [conversationId: string]; // pin / unpin
  "session.revoked": [ref: { userId: string; sessionId?: string }];
  "presence.updated": [ref: { userId: string; online: boolean; lastSeenAt: Date | null }];
  typing: [ref: { conversationId: string; isTyping: boolean; recipient: "owner" | { userId: string } }];
};

export const realtimeBus = new EventEmitter<RealtimeEvents>();
