import type { AuthUser } from "../../modules/auth/services/token.service.ts";
import { AppError } from "../errors/app-error.ts";

type Role = AuthUser["role"];

// What the action is being performed on. Pass only what the rule needs.
export type Resource = {
  conversationUserId?: string; // the regular user who owns the conversation
  senderId?: string; // the sender of the message
};

type Rule = boolean | ((auth: AuthUser, resource: Resource) => boolean);

const inOwnConversation: Rule = (auth, r) => r.conversationUserId === auth.id;
const isSender: Rule = (auth, r) => r.senderId === auth.id;

// action -> role -> rule. Missing resource fields make a rule fail (deny by default).
const policy = {
  // conversations
  "conversation:list": { owner: true, user: false },
  "conversation:read": { owner: true, user: inOwnConversation },
  "conversation:clear": { owner: true, user: false }, // hard delete of all messages
  "conversation:get-own": { owner: true, user: true }, // includes the owner's personal conversation
  "conversation:pin": { owner: true, user: false },

  // messages
  "message:list": { owner: true, user: inOwnConversation },
  "message:send": { owner: true, user: inOwnConversation },
  "message:edit": { owner: isSender, user: isSender }, // only the sender
  "message:delete": { owner: true, user: isSender }, // soft delete
  "message:delete-permanent": { owner: true, user: false }, // hard delete

  // what each role is allowed to see inside a message
  "message:view-deleted": { owner: true, user: false },
  "message:view-edit-history": { owner: true, user: false },

  // reactions (removing only your own reaction is enforced by the data: userId = auth.id)
  "reaction:add": { owner: true, user: inOwnConversation },
  "reaction:remove": { owner: true, user: inOwnConversation },
} satisfies Record<string, Record<Role, Rule>>;

export type Action = keyof typeof policy;

export function can(
  auth: AuthUser,
  action: Action,
  resource: Resource = {},
): boolean {
  const rule: Rule = policy[action][auth.role];
  return typeof rule === "function" ? rule(auth, resource) : rule;
}

export function assertCan(
  auth: AuthUser,
  action: Action,
  resource: Resource = {},
): void {
  if (!can(auth, action, resource)) {
    throw AppError.forbidden("You are not allowed to perform this action.");
  }
}
