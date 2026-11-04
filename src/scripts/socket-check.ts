import { io } from "socket.io-client";

const [url, ownerToken, userToken, conversationId] = process.argv.slice(2);

function connect(label: string, token: string) {
  const socket = io(url, { transports: ["websocket"], auth: { token } });
  socket.onAny((event, ...args) =>
    console.log(`[${label}] ${event}`, JSON.stringify(args)),
  );
  socket.on("connect_error", (err) => {
    console.log(
      `[${label}] connect_error`,
      err.message,
      (err as Error & { data?: unknown }).data,
    );
  });
  return new Promise<typeof socket>((resolve) =>
    socket.on("connect", () => resolve(socket)),
  );
}

const owner = await connect("owner", ownerToken!);
const user = await connect("user", userToken!);

let userTypingFromOwner: unknown;
const userTypingReceived = new Promise<void>((resolve) => {
  user.once("typing", (payload) => {
    userTypingFromOwner = payload;
    resolve();
  });
});
const ownerTypingAck = await owner.emitWithAck("typing", {
  conversationId,
  isTyping: true,
});
await userTypingReceived;
if (
  ownerTypingAck.ok !== true ||
  JSON.stringify(userTypingFromOwner) !== JSON.stringify({ conversationId, isTyping: true })
) {
  throw new Error(`Expected owner typing to reach the user: ${JSON.stringify({ ownerTypingAck, userTypingFromOwner })}`);
}

let ownerTypingFromUser: unknown;
const ownerTypingReceived = new Promise<void>((resolve) => {
  owner.once("typing", (payload) => {
    ownerTypingFromUser = payload;
    resolve();
  });
});
const userTypingAck = await user.emitWithAck("typing", {
  conversationId,
  isTyping: false,
});
await ownerTypingReceived;
if (
  userTypingAck.ok !== true ||
  JSON.stringify(ownerTypingFromUser) !== JSON.stringify({ conversationId, isTyping: false })
) {
  throw new Error(`Expected user typing to reach the owner: ${JSON.stringify({ userTypingAck, ownerTypingFromUser })}`);
}

const rateUser = await connect("rate-limit-user", userToken!);
let forwardedTypingCount = 0;
const countTyping = () => { forwardedTypingCount += 1; };
owner.on("typing", countTyping);
const typingBurst = await Promise.all(
  Array.from({ length: 41 }, (_, index) =>
    rateUser.emitWithAck("typing", {
      conversationId,
      isTyping: index % 2 === 0,
    }),
  ),
);
await new Promise((r) => setTimeout(r, 100));
owner.off("typing", countTyping);
if (typingBurst.some((ack) => ack.ok !== true) || forwardedTypingCount !== 40) {
  throw new Error(`Expected 40 of 41 typing events to be forwarded: ${forwardedTypingCount}`);
}
rateUser.close();

const sent = await user.emitWithAck("message:send", {
  conversationId,
  text: "hello from socket",
});
console.log("ack send:", JSON.stringify(sent));
const id = sent.data.message.id;

const firstRead = await owner.emitWithAck("conversation:read", {
  conversationId,
  messageId: id,
});
if (firstRead.ok !== true || firstRead.data.conversation.unreadCount !== 0) {
  throw new Error(`Expected the read acknowledgement to clear unreadCount: ${JSON.stringify(firstRead)}`);
}
const repeatedRead = await owner.emitWithAck("conversation:read", {
  conversationId,
  messageId: id,
});
if (repeatedRead.ok !== true) {
  throw new Error(`Expected repeating a read to succeed: ${JSON.stringify(repeatedRead)}`);
}

const validReply = await user.emitWithAck("message:send", {
  conversationId,
  text: "reply to the first message",
  replyToId: id,
});
if (validReply.ok !== true || validReply.data.message.replyToId !== id) {
  throw new Error(`Expected the reply ID in the acknowledgement: ${JSON.stringify(validReply)}`);
}
console.log("ack valid reply:", JSON.stringify(validReply));

async function getOwnConversationId(token: string) {
  const response = await fetch(
    `${url!.replace(/\/$/, "")}/api/v1/conversations/me`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!response.ok) {
    throw new Error(`Could not get own conversation: ${response.status}`);
  }
  const result = await response.json();
  return result.conversation.id as string;
}

let otherConversationId = await getOwnConversationId(ownerToken!);
if (otherConversationId === conversationId) {
  otherConversationId = await getOwnConversationId(userToken!);
}
if (otherConversationId === conversationId) {
  throw new Error("Could not find a conversation different from the supplied conversation.");
}
const otherConversationMessage = await owner.emitWithAck("message:send", {
  conversationId: otherConversationId,
  text: "message in another conversation",
});
const crossConversationRead = await owner.emitWithAck("conversation:read", {
  conversationId,
  messageId: otherConversationMessage.data.message.id,
});
if (
  crossConversationRead.ok !== false ||
  crossConversationRead.error.status !== 404 ||
  crossConversationRead.error.code !== "MESSAGE_NOT_FOUND"
) {
  throw new Error(`Expected a 404 for cross-conversation read: ${JSON.stringify(crossConversationRead)}`);
}

const crossConversationReply = await user.emitWithAck("message:send", {
  conversationId,
  text: "reply to a message from another conversation",
  replyToId: otherConversationMessage.data.message.id,
});
if (
  crossConversationReply.ok !== false ||
  crossConversationReply.error.status !== 404 ||
  crossConversationReply.error.code !== "REPLY_TARGET_NOT_FOUND"
) {
  throw new Error(`Expected a 404 for cross-conversation reply: ${JSON.stringify(crossConversationReply)}`);
}

const deletedReplyTarget = await user.emitWithAck("message:send", {
  conversationId,
  text: "message to soft-delete",
});
const deletedReplyTargetId = deletedReplyTarget.data.message.id;
await user.emitWithAck("message:delete", { id: deletedReplyTargetId });
const deletedReply = await user.emitWithAck("message:send", {
  conversationId,
  text: "reply to a deleted message",
  replyToId: deletedReplyTargetId,
});
if (
  deletedReply.ok !== true ||
  deletedReply.data.message.replyToId !== deletedReplyTargetId
) {
  throw new Error(`Expected a reply to the soft-deleted message: ${JSON.stringify(deletedReply)}`);
}

await user.emitWithAck("message:edit", { id, text: "edited" });
await user.emitWithAck("reaction:add", { id, emoji: "👍" });
await owner.emitWithAck("message:send", {
  conversationId,
  text: "owner reply",
});
await user.emitWithAck("message:delete", { id });
console.log(
  "ack permanent (user):",
  JSON.stringify(await user.emitWithAck("message:delete-permanent", { id })),
);
console.log(
  "ack permanent (owner):",
  JSON.stringify(await owner.emitWithAck("message:delete-permanent", { id })),
);

await new Promise((r) => setTimeout(r, 500));
owner.close();
user.close();
