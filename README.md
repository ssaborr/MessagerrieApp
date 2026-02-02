# MyMessagerie

Real-time messaging app with E2E-ready encryption, contact system, and MQTT-based delivery.

## Stack

- **Frontend:** Angular 21, MQTT (HiveMQ), JWT
- **Backend:** Node.js, Express, MongoDB, MQTT
- **Broker:** HiveMQ (public broker for dev)

## How chatting works

1. **Conversations** – One conversation per pair of users. Backend finds or creates it by participant IDs and returns a stable `topic` and `conversationId`.
2. **Topics** – Each conversation has an MQTT topic (HMAC of sorted user IDs). Backend subscribes to that topic and persists every message it receives.
3. **Sending** – Client publishes the message payload (conversationId, senderId, encryptedMessage) on the conversation topic and also POSTs to `/messages` so the message is stored even if MQTT is slow.
4. **Receiving** – Client subscribes to all of the user’s conversation topics (from GET `/conversations`). Incoming MQTT messages either append to the open chat or increment the unread count for that conversation. Unread is kept in frontend state and cleared when the user opens that chat.
5. **Fallback** – While a chat is open, the client polls GET `/messages/:conversationId` every 2s and merges new messages so the thread stays in sync if MQTT drops something.

## Run locally

1. **Env** – In project root, create `.env` with:
   - `JWT_SECRET` – secret for signing tokens
   - `TOPIC_SECRET` – secret for generating MQTT topic names

2. **MongoDB** – Running on `localhost:27017`, DB name `comapp`.

3. **Backend**
   ```bash
   cd backend
   npm install
   node index.js
   ```
   Server: `http://localhost:3000`.

4. **Frontend**
   ```bash
   cd frontend
   npm install
   npm start
   ```
   App: `http://localhost:4200`. Login and signup at `/` and `/sign`; main app at `/home` (auth required).

## Main endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/login` | No | Login, returns JWT + user keys |
| POST | `/sign` | No | Register |
| GET | `/users` | Yes | List/search users |
| GET | `/contacts` | Yes | My contacts (accepted) |
| POST | `/contacts/request` | Yes | Send contact request |
| GET | `/contacts/requests` | Yes | Pending requests to me |
| POST | `/contacts/requests/:id/accept` | Yes | Accept request |
| POST | `/conversations` | Yes | Find or create conversation (body: `receiverId`) |
| GET | `/conversations` | Yes | My conversations (id, topic, otherParticipant) |
| GET | `/messages/:conversationId` | Yes | Message history |
| POST | `/messages` | Yes | Store message (body: conversationId, encryptedMessage) |
| POST | `/presence/heartbeat` | Yes | Mark online |
| GET | `/presence/online` | Yes | List online user IDs |

## Project layout

```
  backend/          # Express API, MQTT subscriber, MongoDB models
  frontend/         # Angular SPA (login, signup, main chat UI)
  README.md
```

