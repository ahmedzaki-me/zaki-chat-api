import { Router, type RequestHandler } from "express";
import fs from "node:fs";
import swaggerUi from "swagger-ui-express";
import YAML from "yaml";

export const docsRouter = Router();

// Locate OpenAPI and AsyncAPI specifications
function resolveSpecPath(primaryName: string, fallbackName: string): URL {
  const primaryUrl = new URL(`../../../docs/${primaryName}`, import.meta.url);
  if (fs.existsSync(primaryUrl)) return primaryUrl;
  return new URL(`../../../docs/${fallbackName}`, import.meta.url);
}

const openApiUrl = resolveSpecPath("openapi.yaml", "openapi.yalm");
const asyncApiUrl = resolveSpecPath("asyncapi.yaml", "asyncapi.yalm");

const openApiYamlRaw = fs.readFileSync(openApiUrl, "utf8");
const openApiSpec = YAML.parse(openApiYamlRaw);

const asyncApiYamlRaw = fs.readFileSync(asyncApiUrl, "utf8");

// Content Security Policy for Swagger UI and AsyncAPI Component
const docsCsp: RequestHandler = (_req, res, next) => {
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self' 'unsafe-inline' https:; img-src 'self' data: https:; font-src 'self' data: https:; connect-src 'self' https: ws: wss:; script-src 'self' 'unsafe-inline' https:; style-src 'self' 'unsafe-inline' https:;",
  );
  next();
};

// Raw Specification endpoints
docsRouter.get(
  ["/docs/openapi.yaml", "/docs/openapi.yalm"],
  (_req, res) => {
    res.type("text/yaml").send(openApiYamlRaw);
  },
);

docsRouter.get(
  ["/docs/asyncapi.yaml", "/docs/asyncapi.yalm"],
  (_req, res) => {
    res.type("text/yaml").send(asyncApiYamlRaw);
  },
);

// Backward compatibility redirect for old Swagger path
docsRouter.use("/api/docs", (_req, res) => {
  res.redirect(301, "/docs");
});

// Interactive AsyncAPI & Socket.IO Event Documentation View
docsRouter.get(["/docs/socket", "/docs/asyncapi"], docsCsp, (req, res) => {
  const protocol = req.protocol;
  const host = req.get("host") || "localhost:3000";
  const specUrl = `${protocol}://${host}/docs/asyncapi.yaml`;
  res.type("html").send(renderSocketDocsHtml(specUrl));
});

// Swagger UI on /docs
docsRouter.use(
  "/docs",
  docsCsp,
  swaggerUi.serve,
  swaggerUi.setup(openApiSpec, {
    customSiteTitle: "Zaki Chat API Documentation",
    customCss: `
      .topbar-wrapper img { content: url('https://raw.githubusercontent.com/swagger-api/swagger-ui/master/dist/favicon-32x32.png'); }
      .asyncapi-nav-btn {
        background: #0284c7; color: #fff !important; font-weight: 600; padding: 6px 14px;
        border-radius: 6px; text-decoration: none; margin-left: 20px; font-size: 13px;
        display: inline-block; transition: background 0.2s;
      }
      .asyncapi-nav-btn:hover { background: #0369a1; }
    `,
    customJsStr: `
      window.addEventListener('load', () => {
        const topbar = document.querySelector('.topbar-wrapper');
        if (topbar && !document.querySelector('.asyncapi-nav-btn')) {
          const btn = document.createElement('a');
          btn.className = 'asyncapi-nav-btn';
          btn.href = '/docs/socket';
          btn.innerText = '⚡ View Socket.IO (AsyncAPI) Docs';
          topbar.appendChild(btn);
        }
      });
    `,
  }),
);

function renderSocketDocsHtml(
  specUrl: string = "http://localhost:3000/docs/asyncapi.yaml",
): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Zaki Chat - Realtime Socket.IO API Reference</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link rel="stylesheet" href="https://unpkg.com/@asyncapi/react-component@latest/styles/default.min.css">
  <style>
    :root {
      --bg: #0b1120;
      --card-bg: #1e293b;
      --border: #334155;
      --text: #f8fafc;
      --text-muted: #94a3b8;
      --primary: #38bdf8;
      --accent: #0284c7;
      --publish: #10b981;
      --subscribe: #3b82f6;
      --ack: #8b5cf6;
      --font-mono: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0; padding: 0;
      background: var(--bg);
      color: var(--text);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      line-height: 1.5;
    }
    .topbar {
      background: #0f172a;
      border-bottom: 1px solid var(--border);
      padding: 14px 28px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      position: sticky;
      top: 0;
      z-index: 100;
    }
    .topbar .title { font-size: 18px; font-weight: 700; display: flex; align-items: center; gap: 8px; color: #fff; }
    .topbar .actions { display: flex; align-items: center; gap: 12px; }
    .btn {
      padding: 7px 14px;
      border-radius: 6px;
      font-size: 13px;
      font-weight: 600;
      text-decoration: none;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      cursor: pointer;
      transition: all 0.2s;
      border: 1px solid transparent;
    }
    .btn-primary { background: var(--accent); color: white; }
    .btn-primary:hover { background: #0369a1; }
    .btn-outline { background: transparent; border-color: var(--border); color: var(--text-muted); }
    .btn-outline:hover { background: #1e293b; color: white; border-color: var(--text-muted); }
    .btn-studio { background: #4f46e5; color: white; }
    .btn-studio:hover { background: #4338ca; }

    .container { max-width: 1240px; margin: 0 auto; padding: 24px; }
    
    .hero {
      background: linear-gradient(180deg, #1e293b 0%, #0f172a 100%);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 24px 28px;
      margin-bottom: 24px;
    }
    .hero h1 { margin: 0 0 8px; font-size: 26px; }
    .hero p { margin: 0 0 16px; color: var(--text-muted); font-size: 15px; }
    .badges { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 16px; }
    .badge {
      display: inline-flex; align-items: center; gap: 6px;
      background: #334155; color: #e2e8f0; font-size: 12px; font-weight: 600;
      padding: 4px 10px; border-radius: 9999px; font-family: var(--font-mono);
    }
    .badge-pub { background: rgba(16, 185, 129, 0.2); color: #34d399; border: 1px solid #10b981; }
    .badge-sub { background: rgba(59, 130, 246, 0.2); color: #60a5fa; border: 1px solid #3b82f6; }

    /* Nav Tabs */
    .tabs { display: flex; gap: 4px; border-bottom: 1px solid var(--border); margin-bottom: 24px; }
    .tab-btn {
      background: transparent; border: none; color: var(--text-muted);
      padding: 12px 20px; font-size: 15px; font-weight: 600; cursor: pointer;
      border-bottom: 2px solid transparent; transition: all 0.2s;
    }
    .tab-btn:hover { color: white; }
    .tab-btn.active { color: var(--primary); border-bottom-color: var(--primary); }

    .tab-content { display: none; }
    .tab-content.active { display: block; }

    /* Connection Card */
    .connect-box {
      background: #020617;
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 16px;
      font-family: var(--font-mono);
      font-size: 13px;
      color: #e2e8f0;
      position: relative;
      margin-bottom: 20px;
      overflow-x: auto;
    }

    /* Event Cards */
    .filter-bar {
      display: flex; gap: 12px; margin-bottom: 20px; align-items: center; flex-wrap: wrap;
    }
    .search-input {
      background: var(--card-bg); border: 1px solid var(--border); border-radius: 6px;
      padding: 9px 16px; color: white; font-size: 14px; flex: 1; min-width: 240px;
    }
    .search-input:focus { outline: none; border-color: var(--primary); }
    .filter-btn {
      background: var(--card-bg); border: 1px solid var(--border); border-radius: 6px;
      padding: 8px 14px; font-size: 13px; font-weight: 600; color: var(--text-muted); cursor: pointer;
    }
    .filter-btn.active { background: #334155; color: white; border-color: var(--text-muted); }

    .event-card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 8px;
      margin-bottom: 14px;
      overflow: hidden;
      transition: border-color 0.2s;
    }
    .event-card:hover { border-color: #475569; }
    .event-header {
      padding: 14px 20px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      cursor: pointer;
      user-select: none;
    }
    .event-title { display: flex; align-items: center; gap: 14px; }
    .event-name { font-size: 16px; font-weight: 700; font-family: var(--font-mono); color: #fff; }
    .event-desc { color: var(--text-muted); font-size: 13px; }
    .event-meta { display: flex; align-items: center; gap: 10px; }
    .tag { font-size: 11px; font-weight: 700; padding: 3px 8px; border-radius: 4px; text-transform: uppercase; font-family: var(--font-mono); }
    .tag-pub { background: #065f46; color: #6ee7b7; }
    .tag-sub { background: #1e40af; color: #93c5fd; }
    .tag-limit { background: #374151; color: #d1d5db; }

    .event-body {
      padding: 20px;
      border-top: 1px solid var(--border);
      background: #152032;
      display: none;
    }
    .event-card.open .event-body { display: block; }
    .event-card.open .chevron { transform: rotate(180deg); }
    .chevron { transition: transform 0.2s; }

    .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
    @media (max-width: 900px) { .grid-2 { grid-template-columns: 1fr; } }

    .code-block {
      background: #020617;
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 14px;
      font-family: var(--font-mono);
      font-size: 12px;
      color: #38bdf8;
      overflow-x: auto;
      white-space: pre;
      position: relative;
    }
    .code-block .copy-btn {
      position: absolute; top: 8px; right: 8px;
      background: #1e293b; border: 1px solid #334155; color: #cbd5e1;
      padding: 4px 8px; border-radius: 4px; font-size: 11px; cursor: pointer;
    }
    .code-block .copy-btn:hover { background: #334155; color: #fff; }

    .prop-table { width: 100%; border-collapse: collapse; font-size: 13px; margin: 10px 0; }
    .prop-table th { text-align: left; padding: 8px; background: #0f172a; color: var(--text-muted); border-bottom: 1px solid var(--border); }
    .prop-table td { padding: 8px; border-bottom: 1px solid #1e293b; }
    .prop-name { font-family: var(--font-mono); color: #38bdf8; font-weight: 600; }
    .prop-type { font-family: var(--font-mono); color: #f472b6; font-size: 12px; }
    .prop-req { color: #f87171; font-weight: 700; font-size: 11px; }

    #asyncapi-container { background: #fff; border-radius: 8px; overflow: hidden; min-height: 800px; color: #000; }
  </style>
</head>
<body>

  <header class="topbar">
    <div class="title">
      <span>⚡ Zaki Chat</span>
      <span style="font-size: 14px; color: var(--text-muted); font-weight: normal;">/ Socket.IO Realtime API</span>
    </div>
    <div class="actions">
      <a href="/docs" class="btn btn-outline">📘 REST API (Swagger)</a>
      <a href="https://studio.asyncapi.com/?url=${encodeURIComponent(specUrl)}" target="_blank" rel="noopener" class="btn btn-studio">🚀 Open in AsyncAPI Studio</a>
      <a href="/docs/asyncapi.yaml" download class="btn btn-primary">📥 Download asyncapi.yaml</a>
    </div>
  </header>

  <main class="container">
    <div class="hero">
      <h1>Socket.IO &amp; AsyncAPI Interactive Reference</h1>
      <p>
        Full real-time event specification for the 1-to-1 messaging engine. Authenticated via JWT handshake and session verification on every event.
      </p>
      <div class="badges">
        <span class="badge">Socket.IO v4</span>
        <span class="badge">Transports: ["websocket"]</span>
        <span class="badge">AsyncAPI 2.6.0</span>
        <span class="badge">Room Scopes: user, session, owner</span>
      </div>
    </div>

    <!-- Navigation Tabs -->
    <div class="tabs">
      <button class="tab-btn active" onclick="switchTab('events')">⚡ Interactive Event Explorer</button>
      <button class="tab-btn" onclick="switchTab('guide')">💻 Client Implementation Guide</button>
      <button class="tab-btn" onclick="switchTab('raw-component')">🎨 Official AsyncAPI Component View</button>
    </div>

    <!-- Tab 1: Interactive Event Explorer -->
    <section id="tab-events" class="tab-content active">
      <div class="filter-bar">
        <input type="text" id="event-search" class="search-input" placeholder="Search event by name (e.g. message:send, typing, presence)..." oninput="filterEvents()">
        <button class="filter-btn active" onclick="filterType('all', this)">All Events (18)</button>
        <button class="filter-btn" onclick="filterType('pub', this)">Client → Server (10)</button>
        <button class="filter-btn" onclick="filterType('sub', this)">Server → Client (8)</button>
      </div>

      <div id="events-list">
        <!-- Client -> Server Events -->
        ${renderEventCard({
          name: "message:send",
          type: "pub",
          summary: "Send a text, media attachment, or voice note",
          permission: "Owner or conversation's user",
          limit: "30 / 10s",
          desc: "Creates a message in the conversation. Supports text, image, video, and voice notes with waveform. Broadcasts message:new and conversation:updated.",
          props: [
            { name: "conversationId", type: "string (24 hex)", req: true, desc: "Target conversation ID." },
            { name: "text", type: "string (1-2000)", req: false, desc: "Text message content (omitted if attachment provided)." },
            { name: "attachment", type: "object", req: false, desc: "Media attachment object (key, kind, size, originalName, durationSec, waveform)." },
            { name: "caption", type: "string (1-2000)", req: false, desc: "Optional caption for image/video attachments." },
            { name: "replyToId", type: "string (24 hex)", req: false, desc: "Parent message ID to reply to." }
          ],
          example: {
            conversationId: "6543210987abcdef01234567",
            text: "Hello Ahmed! How are you?",
            replyToId: null
          },
          ack: { ok: true, data: { message: { id: "654321...", text: "Hello Ahmed! How are you?", createdAt: "2026-11-04T07:00:00Z" } } }
        })}

        ${renderEventCard({
          name: "message:edit",
          type: "pub",
          summary: "Edit an existing message text",
          permission: "Message author only",
          limit: "30 / 10s",
          desc: "Edits text content of a message. Updates editHistory (visible to owner). Broadcasts message:updated.",
          props: [
            { name: "id", type: "string (24 hex)", req: true, desc: "Message ID." },
            { name: "text", type: "string (1-2000)", req: true, desc: "New trimmed text content." }
          ],
          example: { id: "6543210987abcdef01234567", text: "Updated message text" },
          ack: { ok: true, data: { message: { id: "654321...", text: "Updated message text", editedAt: "2026-11-04T07:05:00Z" } } }
        })}

        ${renderEventCard({
          name: "message:delete",
          type: "pub",
          summary: "Soft delete a message",
          permission: "Message author or Owner",
          limit: "30 / 10s",
          desc: "Marks message as soft-deleted. For regular users, text and media become null. Owner retains visibility.",
          props: [{ name: "id", type: "string (24 hex)", req: true, desc: "Message ID to soft delete." }],
          example: { id: "6543210987abcdef01234567" },
          ack: { ok: true, data: { message: { id: "654321...", deletedAt: "2026-11-04T07:10:00Z" } } }
        })}

        ${renderEventCard({
          name: "message:delete-permanent",
          type: "pub",
          summary: "Permanently delete a message (Hard Delete)",
          permission: "Owner only",
          limit: "30 / 10s",
          desc: "Permanently removes message from MongoDB and re-syncs the last message preview.",
          props: [{ name: "id", type: "string (24 hex)", req: true, desc: "Message ID to permanently remove." }],
          example: { id: "6543210987abcdef01234567" },
          ack: { ok: true, data: null }
        })}

        ${renderEventCard({
          name: "reaction:add",
          type: "pub",
          summary: "Add an emoji reaction to a message",
          permission: "Owner or conversation's user",
          limit: "30 / 10s",
          desc: "Adds an emoji reaction idempotently. Validates single emoji with Intl.Segmenter.",
          props: [
            { name: "id", type: "string (24 hex)", req: true, desc: "Target message ID." },
            { name: "emoji", type: "string (1-32 chars)", req: true, desc: "Single emoji (e.g. ❤️, 👍, 🔥)." }
          ],
          example: { id: "6543210987abcdef01234567", emoji: "❤️" },
          ack: { ok: true, data: { message: { id: "654321...", reactions: [{ userId: "...", emoji: "❤️" }] } } }
        })}

        ${renderEventCard({
          name: "reaction:remove",
          type: "pub",
          summary: "Remove caller's reaction from a message",
          permission: "Owner or conversation's user",
          limit: "30 / 10s",
          desc: "Removes only the caller's matching emoji reaction.",
          props: [
            { name: "id", type: "string (24 hex)", req: true, desc: "Target message ID." },
            { name: "emoji", type: "string (1-32 chars)", req: true, desc: "Emoji to remove." }
          ],
          example: { id: "6543210987abcdef01234567", emoji: "❤️" },
          ack: { ok: true, data: { message: { id: "654321...", reactions: [] } } }
        })}

        ${renderEventCard({
          name: "conversation:read",
          type: "pub",
          summary: "Mark messages delivered and read up to messageId",
          permission: "Owner or conversation's user",
          limit: "60 / 10s",
          desc: "Advances read marker. If reading to the latest message, atomically zeroes unreadCount.",
          props: [
            { name: "conversationId", type: "string (24 hex)", req: true, desc: "Conversation ID." },
            { name: "messageId", type: "string (24 hex)", req: true, desc: "Highest message ID read." }
          ],
          example: { conversationId: "6543210987abcdef01234567", messageId: "6543210987abcdef01234599" },
          ack: { ok: true, data: { conversation: { id: "654321...", unreadCount: 0 } } }
        })}

        ${renderEventCard({
          name: "conversation:clear",
          type: "pub",
          summary: "Clear all messages in a conversation",
          permission: "Owner only",
          limit: "20 / 10s",
          desc: "Permanently deletes all messages in the conversation and resets receipts.",
          props: [{ name: "conversationId", type: "string (24 hex)", req: true, desc: "Target conversation ID." }],
          example: { conversationId: "6543210987abcdef01234567" },
          ack: { ok: true, data: null }
        })}

        ${renderEventCard({
          name: "typing",
          type: "pub",
          summary: "Send typing indicator state",
          permission: "Owner or conversation's user",
          limit: "40 / 10s (silent drop)",
          desc: "Forwarded directly to peer without server-side storage. Drops silently if rate limited.",
          props: [
            { name: "conversationId", type: "string (24 hex)", req: true, desc: "Conversation ID." },
            { name: "isTyping", type: "boolean", req: true, desc: "true when typing, false when stopped." }
          ],
          example: { conversationId: "6543210987abcdef01234567", isTyping: true },
          ack: { ok: true, data: null }
        })}

        ${renderEventCard({
          name: "app:visibility",
          type: "pub",
          summary: "Report tab visibility for Web Push suppression",
          permission: "Any authenticated socket",
          limit: "20 / 10s",
          desc: "Informs server that client is viewing a conversation to suppress unnecessary mobile push alerts.",
          props: [
            { name: "visible", type: "boolean", req: true, desc: "true if browser tab is active/visible." },
            { name: "conversationId", type: "string (24 hex)", req: false, desc: "Currently open conversation ID." }
          ],
          example: { visible: true, conversationId: "6543210987abcdef01234567" },
          ack: { ok: true, data: null }
        })}

        <!-- Server -> Client Events -->
        ${renderEventCard({
          name: "message:new",
          type: "sub",
          summary: "Broadcasted when a new message is sent",
          permission: "Owner room & Conversation user room",
          limit: "Server Broadcast",
          desc: "Delivers new message payload. Serialized role-specifically (owner gets full data, user gets sanitized view).",
          props: [{ name: "message", type: "object", req: true, desc: "The serialized public message object." }],
          example: {
            message: {
              id: "6543210987abcdef01234567",
              conversationId: "6543210987abcdef01234500",
              senderId: "6543210987abcdef01234501",
              type: "text",
              text: "Hello! How can I help you?",
              createdAt: "2026-11-04T07:15:00.000Z"
            }
          }
        })}

        ${renderEventCard({
          name: "message:updated",
          type: "sub",
          summary: "Broadcasted on message edit, soft-delete, or reaction",
          permission: "Owner room & Conversation user room",
          limit: "Server Broadcast",
          desc: "Emitted whenever message content, soft-deleted status, or reaction list is updated.",
          props: [{ name: "message", type: "object", req: true, desc: "Updated message payload." }],
          example: {
            message: {
              id: "6543210987abcdef01234567",
              text: "Updated text",
              editedAt: "2026-11-04T07:18:00.000Z"
            }
          }
        })}

        ${renderEventCard({
          name: "message:deleted",
          type: "sub",
          summary: "Broadcasted on permanent message removal",
          permission: "Owner room & Conversation user room",
          limit: "Server Broadcast",
          desc: "Informs clients that a message was hard-deleted from storage.",
          props: [
            { name: "id", type: "string", req: true, desc: "Deleted message ID." },
            { name: "conversationId", type: "string", req: true, desc: "Conversation ID." }
          ],
          example: { id: "6543210987abcdef01234567", conversationId: "6543210987abcdef01234500" }
        })}

        ${renderEventCard({
          name: "conversation:updated",
          type: "sub",
          summary: "Broadcasted when conversation metadata or receipts change",
          permission: "Owner room & Conversation user room",
          limit: "Server Broadcast",
          desc: "Emitted when lastMessage, unreadCount, peerDeliveredUpTo, peerReadUpTo, or pinned status changes.",
          props: [{ name: "conversation", type: "object", req: true, desc: "Full conversation DTO." }],
          example: {
            conversation: {
              id: "6543210987abcdef01234500",
              unreadCount: 1,
              lastMessage: { id: "...", text: "..." },
              lastMessageAt: "2026-11-04T07:20:00.000Z"
            }
          }
        })}

        ${renderEventCard({
          name: "conversation:cleared",
          type: "sub",
          summary: "Broadcasted when an entire conversation is cleared",
          permission: "Owner room & Conversation user room",
          limit: "Server Broadcast",
          desc: "Signals the client to clear all local messages for this conversation.",
          props: [{ name: "conversationId", type: "string", req: true, desc: "Cleared conversation ID." }],
          example: { conversationId: "6543210987abcdef01234500" }
        })}

        ${renderEventCard({
          name: "typing",
          type: "sub",
          summary: "Forwarded typing indicator from peer",
          permission: "Peer recipient room only",
          limit: "Real-time Forward",
          desc: "Sent only to the recipient user or owner room when the other party is typing.",
          props: [
            { name: "conversationId", type: "string", req: true, desc: "Conversation ID." },
            { name: "isTyping", type: "boolean", req: true, desc: "Typing active state." }
          ],
          example: { conversationId: "6543210987abcdef01234500", isTyping: true }
        })}

        ${renderEventCard({
          name: "presence:updated",
          type: "sub",
          summary: "Ordinary user connected or disconnected",
          permission: "Owner room only",
          limit: "Owner Broadcast",
          desc: "Sent only to the Owner when a user transitions between 0 and 1+ active sockets.",
          props: [
            { name: "userId", type: "string", req: true, desc: "User ID." },
            { name: "online", type: "boolean", req: true, desc: "Online status." },
            { name: "lastSeenAt", type: "string | null", req: true, desc: "ISO timestamp of last seen." }
          ],
          example: { userId: "6543210987abcdef01234501", online: true, lastSeenAt: null }
        })}

        ${renderEventCard({
          name: "presence:snapshot",
          type: "sub",
          summary: "Initial snapshot of all online users",
          permission: "Connecting Owner socket only",
          limit: "Connection Snapshot",
          desc: "Emitted immediately upon Owner socket connection containing array of all currently connected user IDs.",
          props: [{ name: "onlineUserIds", type: "string[]", req: true, desc: "List of online user IDs." }],
          example: { onlineUserIds: ["6543210987abcdef01234501", "6543210987abcdef01234599"] }
        })}
      </div>
    </section>

    <!-- Tab 2: Client Guide -->
    <section id="tab-guide" class="tab-content">
      <div class="hero" style="background: #111827;">
        <h2>Frontend Implementation Guide (Socket.IO Client)</h2>
        <p>Follow these standard patterns to connect, authenticate, handle token refresh, and register listeners.</p>
        
        <h3>1. Connecting with Authentication</h3>
        <div class="connect-box">import { io } from "socket.io-client";

const socket = io("http://localhost:3000", {
  transports: ["websocket"], // WebSocket only transport is enforced
  auth: {
    token: accessToken // Short-lived JWT access token
  }
});

socket.on("connect", () => {
  console.log("Connected with socket id:", socket.id);
});

socket.on("connect_error", async (err) => {
  // If token expired, refresh via REST API and reconnect
  if (err.data?.code === "TOKEN_EXPIRED") {
    const res = await fetch("/api/v1/auth/refresh", { method: "POST" });
    const { accessToken } = await res.json();
    socket.auth.token = accessToken;
    socket.connect();
  }
});</div>

        <h3>2. Sending an Event with Acknowledgement</h3>
        <div class="connect-box">// Sending a message with acknowledgement callback
socket.emit("message:send", {
  conversationId: "6543210987abcdef01234567",
  text: "Hello there!"
}, (response) => {
  if (response.ok) {
    console.log("Message created successfully:", response.data.message);
  } else {
    console.error("Message send failed:", response.error.code, response.error.detail);
  }
});</div>

        <h3>3. Listening for Real-time Broadcasts</h3>
        <div class="connect-box">socket.on("message:new", ({ message }) => {
  console.log("New message arrived:", message);
  // Append to chat view
});

socket.on("conversation:updated", ({ conversation }) => {
  console.log("Conversation state updated:", conversation);
  // Update unread badges, last message preview, etc.
});

socket.on("typing", ({ conversationId, isTyping }) => {
  // Show or hide typing bubble with auto-expire timer
});</div>

        <h3>4. Reporting Tab Visibility for Web Push Suppression</h3>
        <div class="connect-box">// Send when tab focus or active conversation changes
document.addEventListener("visibilitychange", () => {
  socket.emit("app:visibility", {
    visible: document.visibilityState === "visible",
    conversationId: activeConversationId
  });
});</div>
      </div>
    </section>

    <!-- Tab 3: Official AsyncAPI Component -->
    <section id="tab-raw-component" class="tab-content">
      <div id="asyncapi-container"></div>
    </section>
  </main>

  <script src="https://unpkg.com/@asyncapi/react-component@latest/browser/standalone/index.js"></script>
  <script>
    function switchTab(tabId) {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      
      const activeBtn = Array.from(document.querySelectorAll('.tab-btn')).find(b => b.getAttribute('onclick').includes(tabId));
      if (activeBtn) activeBtn.classList.add('active');
      
      const activeContent = document.getElementById('tab-' + tabId);
      if (activeContent) activeContent.classList.add('active');

      if (tabId === 'raw-component' && !window.asyncapiLoaded) {
        window.asyncapiLoaded = true;
        if (window.AsyncApiStandalone) {
          AsyncApiStandalone.render({
            schema: { url: '/docs/asyncapi.yaml' },
            config: { show: { sidebar: true } }
          }, document.getElementById('asyncapi-container'));
        }
      }
    }

    function toggleCard(header) {
      header.parentElement.classList.toggle('open');
    }

    function copyCode(btn) {
      const code = btn.nextElementSibling.innerText;
      navigator.clipboard.writeText(code);
      btn.innerText = 'Copied!';
      setTimeout(() => btn.innerText = 'Copy', 1500);
    }

    function filterType(type, btn) {
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      window.currentFilter = type;
      filterEvents();
    }

    function filterEvents() {
      const query = (document.getElementById('event-search').value || '').toLowerCase();
      const type = window.currentFilter || 'all';
      
      document.querySelectorAll('.event-card').forEach(card => {
        const name = card.getAttribute('data-name').toLowerCase();
        const cardType = card.getAttribute('data-type');
        
        const matchesQuery = name.includes(query);
        const matchesType = type === 'all' || cardType === type;
        
        card.style.display = (matchesQuery && matchesType) ? 'block' : 'none';
      });
    }
  </script>
</body>
</html>`;
}

function renderEventCard(e: {
  name: string;
  type: "pub" | "sub";
  summary: string;
  permission: string;
  limit: string;
  desc: string;
  props: Array<{ name: string; type: string; req: boolean; desc: string }>;
  example: object;
  ack?: object;
}): string {
  const isPub = e.type === "pub";
  const typeTag = isPub ? "tag-pub" : "tag-sub";
  const typeLabel = isPub ? "Client → Server (Publish)" : "Server → Client (Subscribe)";

  const propRows = e.props
    .map(
      (p) => `<tr>
        <td class="prop-name">${p.name}</td>
        <td class="prop-type">${p.type}</td>
        <td>${p.req ? '<span class="prop-req">Required</span>' : '<span style="color:var(--text-muted)">Optional</span>'}</td>
        <td style="color:#cbd5e1;">${p.desc}</td>
      </tr>`,
    )
    .join("");

  return `
  <div class="event-card" data-name="${e.name}" data-type="${e.type}">
    <div class="event-header" onclick="toggleCard(this)">
      <div class="event-title">
        <span class="tag ${typeTag}">${isPub ? "PUBLISH" : "SUBSCRIBE"}</span>
        <div>
          <div class="event-name">${e.name}</div>
          <div class="event-desc">${e.summary}</div>
        </div>
      </div>
      <div class="event-meta">
        <span class="tag tag-limit">${e.limit}</span>
        <svg class="chevron" width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>
      </div>
    </div>
    <div class="event-body">
      <p style="margin-top:0; color:#cbd5e1;">${e.desc}</p>
      <div style="margin-bottom: 12px; font-size: 13px;">
        <strong style="color:var(--primary)">Permission:</strong> <span style="color:#e2e8f0">${e.permission}</span> &nbsp;|&nbsp;
        <strong style="color:var(--primary)">Direction:</strong> <span style="color:#e2e8f0">${typeLabel}</span>
      </div>

      <h4 style="margin: 14px 0 6px; font-size: 14px; color: #f1f5f9;">Payload Parameters</h4>
      <table class="prop-table">
        <thead>
          <tr><th>Field</th><th>Type</th><th>Requirement</th><th>Description</th></tr>
        </thead>
        <tbody>
          ${propRows}
        </tbody>
      </table>

      <div class="grid-2" style="margin-top: 14px;">
        <div>
          <h4 style="margin:0 0 6px; font-size: 13px; color: #f1f5f9;">${isPub ? "Client Payload Example" : "Broadcast Event Data"}</h4>
          <div class="code-block">
            <button class="copy-btn" onclick="copyCode(this)">Copy</button>
            <code>${JSON.stringify(e.example, null, 2)}</code>
          </div>
        </div>
        ${
          e.ack
            ? `<div>
                <h4 style="margin:0 0 6px; font-size: 13px; color: #f1f5f9;">Server Ack Callback Response</h4>
                <div class="code-block" style="color: #a78bfa;">
                  <button class="copy-btn" onclick="copyCode(this)">Copy</button>
                  <code>${JSON.stringify(e.ack, null, 2)}</code>
                </div>
              </div>`
            : `<div>
                <h4 style="margin:0 0 6px; font-size: 13px; color: #f1f5f9;">Event Delivery Context</h4>
                <div class="code-block" style="color: #60a5fa;">
                  <code>// Broadcast to: ${e.permission}
// Format: JSON over WebSocket</code>
                </div>
              </div>`
        }
      </div>
    </div>
  </div>`;
}
