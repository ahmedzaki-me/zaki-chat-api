// Client -> server (each one takes an ack callback)
export const ClientEvents = {
  MESSAGE_SEND: "message:send", // { conversationId, text }
  MESSAGE_EDIT: "message:edit", // { id, text }
  MESSAGE_DELETE: "message:delete", // { id }  soft delete
  MESSAGE_DELETE_PERMANENT: "message:delete-permanent", // { id }  owner only
  REACTION_ADD: "reaction:add", // { id, emoji }
  REACTION_REMOVE: "reaction:remove", // { id, emoji }
  CONVERSATION_CLEAR: "conversation:clear", // { conversationId }  owner only
  CONVERSATION_READ: "conversation:read", // { conversationId, messageId }
  TYPING: "typing", // { conversationId, isTyping }
  APP_VISIBILITY: "app:visibility", // { visible, conversationId? }
} as const;

// Server -> client (broadcast)
export const ServerEvents = {
  MESSAGE_NEW: "message:new", // { message }
  MESSAGE_UPDATED: "message:updated", // { message }  edit, soft delete, reactions
  MESSAGE_DELETED: "message:deleted", // { id, conversationId }  hard delete
  CONVERSATION_UPDATED: "conversation:updated", // { conversation }
  CONVERSATION_CLEARED: "conversation:cleared", // { conversationId }
  TYPING: "typing", // { conversationId, isTyping }
  PRESENCE_UPDATED: "presence:updated", // { userId, online, lastSeenAt }
  PRESENCE_SNAPSHOT: "presence:snapshot", // { onlineUserIds }
} as const;
