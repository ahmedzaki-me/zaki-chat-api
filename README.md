# 💬 Zaki Chat API

[![Node.js Version](https://img.shields.io/badge/Node.js-%3E%3D24-brightgreen.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue.svg)](https://www.typescriptlang.org/)
[![Express](https://img.shields.io/badge/Express-5.x-lightgrey.svg)](https://expressjs.com/)
[![Socket.IO](https://img.shields.io/badge/Socket.IO-4.x-black.svg)](https://socket.io/)
[![MongoDB](https://img.shields.io/badge/MongoDB-Mongoose%209-green.svg)](https://mongoosejs.com/)
[![Encryption](https://img.shields.io/badge/Encryption-AES--256--GCM-orange.svg)]()
[![Documentation](https://img.shields.io/badge/API%20Docs-Swagger%20%26%20AsyncAPI-blueviolet.svg)](http://localhost:3000/docs)

> A production-grade, secure, 1-to-1 real-time messaging backend engineered with **Express 5**, **TypeScript**, **MongoDB**, **Socket.IO**, **Backblaze B2 (S3-compatible)**, and **Web Push (VAPID)**.

---

## 🌟 Executive Summary & Concept

**Zaki Chat API** is designed specifically for an **Owner-centric (Portfolio / Direct Contact) Messaging Platform**. Unlike generic chat apps with arbitrary user-to-user rooms:

- There is **strictly one Owner** account (enforced at the database level via a unique partial MongoDB index and initialized via a dedicated CLI script).
- Every other user (Guest or Registered Account) communicates exclusively with the Owner in an isolated 1-to-1 conversation.
- The Owner can view all incoming conversations, pin important chats, inspect edit histories, review deleted messages, and view real-time presence indicators.
- Users enjoy complete privacy and an intuitive direct messaging channel with zero overhead.

---

## 🛡️ Core Engineering Highlights

### 1. At-Rest Message Encryption (AES-256-GCM)

- All message texts and caption contents are encrypted at the field level before being committed to MongoDB.
- Utilizes authenticated encryption (`AES-256-GCM`) with a 12-byte initialization vector (`iv`), 16-byte authentication tag (`authTag`), and key versioning (`keyVersion`).
- Supports zero-downtime key rotation via an active key ID (`MESSAGE_ENCRYPTION_KEY_ACTIVE`) and backwards-compatible keyring.
- Prevents lost updates during message edits using optimistic locking on the message's `text.iv`.

### 2. High-Assurance Media Storage & Magic-Byte Verification

- Clients upload directly to Backblaze B2 (S3-compatible) using presigned PUT URLs (`/api/v1/uploads/presign`).
- **Server-Side File Signature (Magic Bytes) Verification:** Before confirming any attachment or avatar, the server initiates an S3 `HeadObject` followed by a `Range: bytes=0-15` byte-level inspection to verify actual file headers (`RIFF/WEBP`, `JPEG`, `PNG`, `MP4/ftyp`, `WebM`, `OGG`).
- If an upload was spoofed (e.g., an executable renamed to `.webp`), the server immediately purges the malicious object from storage (`discardAndReject`) and rejects the request.
- Presigned download URLs are generated on-demand with a 1-hour expiration and never leak private storage keys.

### 3. Session-Centric Authentication & Replay Attack Defense

- **Guest Access:** Instant onboarding requiring only a display name (`POST /api/v1/auth/guest`).
- **Account Upgrades:** Guests can seamlessly link a unique username and password (`Argon2` hashing) without losing existing chats (`POST /api/v1/auth/upgrade`).
- **Dual-Token Lifetime:**
  - Stateless 15-minute JWT Access Tokens signed with `jose` (HS256).
  - Cryptographically random 32-byte Refresh Tokens hashed (`SHA-256`) in MongoDB, delivered via `httpOnly`, `SameSite: Strict` cookies (90-day TTL).
- **Token Rotation & Automatic Revocation:** Every refresh rotates the token. If an already-used refresh token is presented (indicating theft or token replay), the server **immediately revokes the entire session and deletes associated Web Push subscriptions**.
- **Real-Time Remote Termination:** Revoking a session via REST instantly forces a disconnect on all active WebSocket connections for that session.

### 4. Real-Time Engine & Dual-View Serialization

- Pure WebSocket transport (`transports: ["websocket"]`) with per-event session validation and fixed-window rate limiting.
- **Dual-View Serialization:** Broadcasts use a role-aware mapper (`toBoth`). The Owner socket receives full metadata (including edit history and soft-deleted content placeholders), while regular users receive a sanitized DTO.
- **Presence & Ephemeral Typing:** Real-time presence updates and snapshots sent strictly to the Owner. Typing indicators are purely ephemeral and forwarded without database overhead.

### 5. High-Water Mark Delivery & Read Receipts

- Rather than maintaining boolean read flags per message, conversations track monotonic high-water ObjectIds: `userDeliveredUpTo`, `userReadUpTo`, `ownerDeliveredUpTo`, and `ownerReadUpTo`.
- Connecting accounts atomically mark all pending messages delivered in a single `bulkWrite`.
- Marking a conversation as read up to the latest message atomically zeroes `unreadCount` in a single query.
- Deleting messages atomically decrements `unreadCount` without requiring expensive collection-wide aggregations.

### 6. Smart Web Push Notifications (VAPID) & Visibility Suppression

- Browser push notifications sent via standard VAPID (`web-push`).
- **Active Visibility Suppression:** Sockets emit `app:visibility` when the user's tab is focused and viewing a conversation. When active, push notifications are smartly suppressed to avoid duplicate alerts.
- Stale subscriptions (expired sessions or `404/410 Gone` responses) are automatically purged.

### 7. Automated Bilingual Welcome Onboarding

- When a new user conversation is initialized, the system automatically posts an introductory message from the Owner.
- Clarifies end-to-end privacy, encourages browser notifications and PWA installation, and (if the user is a guest) recommends account upgrade.
- Supports both Arabic (`ar`) and English (`en`), selected dynamically via the client's `x-lang` header.

---

## 🏗️ Project Architecture & Directory Layout

```
zaki-chat-api/
├── docs/
│   ├── openapi.yalm             # Full REST API OpenAPI 3.1.0 specification
│   ├── openapi.yaml             # Standard YAML alias for OpenAPI
│   └── asyncapi.yaml            # Socket.IO Realtime Event specification (AsyncAPI 2.6)
├── src/
│   ├── config/
│   │   └── env.ts               # Zod-validated environment config & keyrings
│   ├── modules/
│   │   ├── auth/                # JWT, Argon2, sessions, and refresh token rotation
│   │   │   ├── controllers/     # auth.controller.ts, session.controller.ts, auth.http.ts
│   │   │   ├── middleware/      # require-auth.ts
│   │   │   ├── models/          # session.model.ts, refresh-token.model.ts
│   │   │   ├── routes/          # auth.routes.ts
│   │   │   ├── schemas/         # auth.schemas.ts
│   │   │   └── services/        # auth.service.ts, session.service.ts, token.service.ts
│   │   ├── conversations/       # 1-to-1 chat sessions, receipts & unread tracking
│   │   │   ├── controllers/     # conversation.controller.ts, conversation.http.ts
│   │   │   ├── models/          # conversation.model.ts
│   │   │   ├── routes/          # conversation.routes.ts
│   │   │   ├── schemas/         # conversation.schemas.ts
│   │   │   └── services/        # conversation.service.ts, receipt.service.ts
│   │   ├── docs/                # Swagger UI, AsyncAPI explorer & raw specs
│   │   │   └── docs.routes.ts   # Interactive documentation router (/docs, /docs/socket)
│   │   ├── messages/            # Text, voice notes, media, edits, and reactions
│   │   │   ├── controllers/     # message.controller.ts, reaction.controller.ts
│   │   │   ├── models/          # message.model.ts
│   │   │   ├── routes/          # message.routes.ts, message-item.routes.ts
│   │   │   ├── schemas/         # message.schemas.ts, reaction.schemas.ts
│   │   │   └── services/        # message.service.ts, reaction.service.ts, last-message.service.ts
│   │   ├── push/                # VAPID Web Push delivery and subscriptions
│   │   ├── uploads/             # Presigned upload URLs
│   │   └── users/               # User entities, avatar management
│   │       ├── controllers/     # user.controller.ts, user.http.ts
│   │       ├── models/          # user.model.ts
│   │       ├── routes/          # user.routes.ts
│   │       └── schemas/         # user.schemas.ts
│   ├── realtime/                # Socket.IO connection registry, rate limiters, publisher
│   │   ├── index.ts             # Socket server bootstrap & presence lifecycle
│   │   ├── auth.ts              # Handshake authentication
│   │   ├── bus.ts               # Internal decoupled event emitter
│   │   ├── publisher.ts         # Broadcasts & dual-view serialization
│   │   └── handler.ts           # Ack wrapper & per-socket rate limiting
│   ├── scripts/                 # CLI utilities (create-owner, generate-vapid, test-b2)
│   ├── shared/                  # AES encryption, S3 storage adapter, errors, policies
│   │   ├── crypto/              # message-crypto.ts
│   │   ├── errors/              # RFC 7807 ProblemDetails & AppError
│   │   ├── middlewares/         # rate-limit.ts, turnstile.ts, error-handler.ts, not-found.ts
│   │   ├── permissions/         # Centralized declarative policy (policy.ts)
│   │   └── storage/             # b2-storage.service.ts, media-verification.service.ts
│   ├── app.ts                   # Express application setup, routes & documentation endpoints
│   └── server.ts                # HTTP & Socket.IO server startup & graceful shutdown
└── README.md
```

---

## 🚀 Getting Started

### Prerequisites

- **Node.js**: v24.x or higher
- **MongoDB**: v6.0+ instance (local or MongoDB Atlas)
- **Backblaze B2** (or any AWS S3-compatible object storage)

### 1. Installation

Clone the repository and install dependencies:

```bash
git clone https://github.com/AhmedZaki/zaki-chat-api.git
cd zaki-chat-api
npm install
```

### 2. Environment Configuration

Create a `.env` file in the root directory (based on `.env.example`):

```env
NODE_ENV=development
PORT=3000
MONGODB_URI=mongodb://localhost:27017/zaki_chat

CLIENT_ORIGIN=http://localhost:5173
LOG_LEVEL=info

# JWT Secrets (at least 32 characters)
JWT_ACCESS_SECRET=your_super_secret_jwt_access_key_min_32_chars
JWT_REFRESH_SECRET=your_super_secret_jwt_refresh_key_min_32_chars

# Message Encryption (AES-256-GCM 32-byte Base64 keys)
MESSAGE_ENCRYPTION_KEY_ACTIVE=1
MESSAGE_ENCRYPTION_KEY_V1=base64_encoded_32_byte_cryptographic_key==

# Backblaze B2 / S3 Configuration
B2_KEY_ID=your_b2_key_id
B2_APPLICATION_KEY=your_b2_app_key
B2_BUCKET=your_bucket_name
B2_ENDPOINT=https://s3.us-east-005.backblazeb2.com
B2_REGION=us-east-005

# Web Push VAPID Keys (Optional in dev, required in production)
VAPID_PUBLIC_KEY=your_vapid_public_key
VAPID_PRIVATE_KEY=your_vapid_private_key
VAPID_SUBJECT=mailto:admin@example.com

# Cloudflare Turnstile Bot & Rotating Proxy Protection
# Optional in dev/test (defaults to Cloudflare dummy test key), required in production
TURNSTILE_SECRET_KEY=bc1qpjq2u4vwnyxe3u0flg8hfp3c8mfmd9f38ydu07
TURNSTILE_ENABLED=false
```

> **Tip:** You can generate fresh VAPID keys using:
>
> ```bash
> npm run generate-vapid
> ```

### 3. Initialize the Owner Account

Since the system is single-owner, run the interactive CLI prompt to create the Owner:

```bash
npm run create-owner
```

Follow the terminal prompts to set the Owner's display name, username, and secure password.

### 4. Running the Application

```bash
# Start in development mode with live reload
npm run dev

# Run TypeScript type check
npm run typecheck

# Build for production
npm run build

# Start production server
npm start
```

---

## 📖 Interactive API Documentation

Once the server is running, navigate in your browser to:

| Interface                                  | URL                                        | Description                                                                                                  |
| :----------------------------------------- | :----------------------------------------- | :----------------------------------------------------------------------------------------------------------- |
| **REST API Documentation (Swagger UI)**    | `http://localhost:3000/docs`               | Interactive Swagger UI detailing all 25+ REST endpoints, schemas, validation errors, and RFC 7807 responses. |
| **Real-time API Documentation (AsyncAPI)** | `http://localhost:3000/docs/socket`        | Interactive AsyncAPI UI documenting all Socket.IO client/server events, payloads, rooms, and rate limits.    |
| **Raw OpenAPI YAML Specification**         | `http://localhost:3000/docs/openapi.yaml`  | Machine-readable OpenAPI 3.1.0 document (`openapi.yalm`).                                                    |
| **Raw AsyncAPI YAML Specification**        | `http://localhost:3000/docs/asyncapi.yaml` | Machine-readable AsyncAPI 2.6.0 document.                                                                    |

---

## 🚦 Rate Limiting & Bot Protection

### 1. Cloudflare Turnstile Human Interactivity Verification

Authentication endpoints (`/guest`, `/login`, `/signup`, `/upgrade`) are protected by Cloudflare Turnstile to prevent automated credential stuffing, bot spamming, and rotating proxy attacks.

#### Frontend Token Submission
Frontend clients obtain a widget challenge token and send it with the request using either:
- **HTTP Header (Recommended):**
  ```http
  cf-turnstile-response: <TOKEN>
  ```
- **Request Body:**
  ```json
  {
    "turnstileToken": "<TOKEN>",
    "username": "..."
  }
  ```
  *(The middleware automatically sanitizes and removes `turnstileToken` from `req.body` to preserve strict Zod validation schema integrity).*

#### Multi-Layer Defense Pipeline
To ensure maximum resource protection, authentication middleware runs in a strict defense sequence:
```
Request ──► [1. ipAuthLimiter] ──► [2. verifyTurnstile] ──► [3. globalAuthLimiter] ──► [4. strictAccountLimiter] ──► Controller
```
1. **`ipAuthLimiter` runs FIRST:** Prevents a single malicious IP from flooding our server with outgoing requests to Cloudflare.
2. **`verifyTurnstile` runs SECOND:** Verifies human presence before any circuit breaker quota is consumed.
3. **`globalAuthLimiter` runs THIRD:** Shields against distributed rotating proxies while allowing legitimate human users through.
4. **`strictAccountLimiter` runs FOURTH:** Throttles only failed password/upgrade attempts per account (`skipSuccessfulRequests: true`).

### 2. HTTP Multi-Layered Rate Limiting (`express-rate-limit`)

All REST endpoints are protected with standard RFC headers (`RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset`, `Retry-After`) and return RFC 7807 Problem Details JSON (`429 Too Many Requests`).

| Limiter Layer | Scope / Key | Window | Max Quota | Policy & Target Routes |
| :--- | :--- | :---: | :---: | :--- |
| **`globalAuthLimiter`** | Global circuit breaker (`'global_auth_limit'`) | 1 min | **150** | Prevents distributed rotating-proxy flooding on all authentication endpoints (`/guest`, `/login`, `/signup`, `/upgrade`, `/refresh`, `/logout`). |
| **`ipAuthLimiter`** | Per-client IP (IPv6 subnet normalized) | 15 min | **15** | Shields auth endpoints from credential stuffing and bot brute-force per IP. |
| **`strictAccountLimiter`** | Per-Account via `smartKeyGenerator` (`account:<username>` or `user:<id>`) | 15 min | **5** | **`skipSuccessfulRequests: true`**: Only penalizes failed attempts (4xx/5xx). Protects `/login`, `/signup`, and `/upgrade`. |
| **`generalApiLimiter`** | Per-User via `smartKeyGenerator` (`user:<id>`) or fallback IP | 1 min | **60** | Evaluated **immediately after** `requireAuth` to guarantee legitimate users on shared NAT/corporate IPs are never penalized. Applied across `/messages`, `/conversations`, `/uploads`, `/users`, and `/push`. |

### 3. Socket.IO Fixed-Window Throttling (Per 10 Seconds)

| Category      | Events                                                                                     | Max Events / 10s | Behavior upon Exceeding                                              |
| :------------ | :----------------------------------------------------------------------------------------- | :--------------: | :------------------------------------------------------------------- |
| **`message`** | `message:send`, `message:edit`, `message:delete`, `message:delete-permanent`, `reaction:*` |      **30**      | Returns `429 RATE_LIMITED` acknowledgment. Connection is maintained. |
| **`read`**    | `conversation:read`                                                                        |      **60**      | Returns `429 RATE_LIMITED`.                                          |
| **`typing`**  | `typing`                                                                                   |      **40**      | Drops excess typing events silently (`{ ok: true, data: null }`).    |
| **`other`**   | `app:visibility`, `conversation:clear`                                                     |      **20**      | Returns `429 RATE_LIMITED`.                                          |

---

## 🧪 Testing & Verification Utilities

The repository includes ready-to-run verification scripts in `src/scripts/`:

- `npm run create-owner`: Set up the initial administrator/owner account.
- `npm run test-b2`: Verify connectivity and read/write permissions on the S3 bucket.
- `npm run test-upload`: Simulate client presigned upload, binary magic-byte validation, and download cycle.
- `npm run generate-vapid`: Generate a valid VAPID keypair for Web Push notifications.

---

## 📄 License

ISC © [Ahmed Zaki](https://github.com/AhmedZaki)
