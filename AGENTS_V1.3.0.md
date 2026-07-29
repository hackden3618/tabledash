# v1.3.0 — In-App Messaging + Guest Identity

Branch: `development_v1.3.0`. You'll need to `git checkout -b development_v1.3.0` . Everything below is written as a plan/spec to implement on it, same as v1.2.0's plan — not yet applied to the codebase.

This builds directly on v1.2.0's event-driven core (Part 2 of the previous plan) and tenant model (Part 5) — messaging is a new feature module, not a parallel architecture. Sequence this **after** v1.2.0's `Hotel`/`PlatformAdmin`/RBAC work lands, since every conversation type here is scoped by the roles that work introduces (`CUSTOMER`, `HOTEL_STAFF`, `HOTEL_ADMIN`, `PLATFORM_ADMIN`).

---

## Part 1 — Guest identity (build this first; messaging depends on it)

### The gap
Today, a customer without a PIN account (`Customer.pinHash === null`) is only ever identified by re-typing their phone number at checkout. There's no persistent client-side identity, so a returning guest has no way to see their own message threads, order history, or typing presence across visits without re-entering their phone every time.

### Design
- On first app load, if no identifier exists yet, the client generates a UUID (`crypto.randomUUID()`) and stores it in `localStorage` as `tableDash_guest_id`. This is generated once and never regenerated — it's the anchor for everything that follows.
- Every API request (customer-facing, unauthenticated) sends it as a header: `X-Guest-Id: <uuid>`. Same convention as the existing `Authorization: Bearer` header in `apiGet`/`apiPost` — additive, not a replacement.
- New table:
```prisma
model GuestIdentity {
  id         String    @id @default(uuid()) @db.Uuid   // matches the client-generated UUID directly — no separate server-side ID
  customerId String?   @map("customer_id") @db.Uuid    // set once the guest places an order with a phone, or registers
  createdAt  DateTime  @default(now()) @map("created_at") @db.Timestamptz()

  customer Customer? @relation(fields: [customerId], references: [id])
  @@map("guest_identities")
}
```
- First request carrying a given `X-Guest-Id` the server hasn't seen creates the `GuestIdentity` row (upsert-on-first-use, not a separate registration step — no friction added to the existing guest checkout flow).
- When a guest places an order (`placeOrder`), or later registers a PIN account, backfill `GuestIdentity.customerId` — this is what lets a guest's conversation history and order history survive across sessions on the same device without ever forcing login, and lets it correctly merge into their account if they register later.
- **Boundary:** a `GuestIdentity` is a device-local convenience, not authentication. It must never be trusted for anything privileged — no payment actions, no viewing another customer's data, nothing that `CustomerAuthContext`'s real PIN-based token already guards. Its only job is "let this browser find its own stuff again." Treat a lost/cleared `localStorage` as an accepted, expected loss of guest history — no recovery flow needed for this tier, that's what the PIN account upgrade path is for.

---

## Part 2 — Messaging feature module (`messaging/`)

New feature-based module, matching the existing per-module layout convention:
```
messaging/
  controller.ts
  service.ts
  schema.ts
  routes.ts
  websocket.ts
```

### Schema

```prisma
enum ConversationType {
  DIRECT                 // two-way, exactly 2 participants
  GROUP                  // two-way, N participants (e.g. a hotel's staff team thread)
  HOTEL_ANNOUNCEMENT      // one-way, hotel -> its customers
  GLOBAL_ANNOUNCEMENT     // one-way, platform -> everyone
  SUPPORT                 // two-way, customer<->platform or hotel<->platform
}

enum ParticipantKind {
  CUSTOMER
  GUEST          // unregistered customer, identified by GuestIdentity
  HOTEL_STAFF
  PLATFORM_ADMIN
}

model Conversation {
  id            String           @id @default(uuid()) @db.Uuid
  type          ConversationType
  hotelId       String?          @map("hotel_id") @db.Uuid   // null for GLOBAL_ANNOUNCEMENT and platform SUPPORT
  title         String?                                        // group/announcement subject line
  createdAt     DateTime         @default(now()) @map("created_at") @db.Timestamptz()
  lastMessageAt DateTime?        @map("last_message_at") @db.Timestamptz()

  participants ConversationParticipant[]
  messages     Message[]

  @@index([hotelId])
  @@map("conversations")
}

model ConversationParticipant {
  id             String          @id @default(uuid()) @db.Uuid
  conversationId String          @map("conversation_id") @db.Uuid
  kind           ParticipantKind
  customerId     String?         @map("customer_id") @db.Uuid
  guestIdentityId String?        @map("guest_identity_id") @db.Uuid
  adminUserId    String?         @map("admin_user_id") @db.Uuid   // hotel staff/admin, FK to AdminUser (v1.2.0)
  platformAdminId String?        @map("platform_admin_id") @db.Uuid
  canReply       Boolean         @default(true)   // false for the audience side of a one-way announcement
  lastReadAt     DateTime?       @map("last_read_at") @db.Timestamptz()

  conversation Conversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)

  @@unique([conversationId, customerId, guestIdentityId, adminUserId, platformAdminId])
  @@map("conversation_participants")
}

model Message {
  id                  String   @id @default(uuid()) @db.Uuid
  conversationId      String   @map("conversation_id") @db.Uuid
  senderParticipantId String   @map("sender_participant_id") @db.Uuid
  body                String   @db.Text
  createdAt           DateTime @default(now()) @map("created_at") @db.Timestamptz()

  conversation Conversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)

  @@index([conversationId, createdAt])
  @@map("messages")
}
```

### Why announcements don't fan out participant rows

A `GLOBAL_ANNOUNCEMENT` could reach every customer who has ever ordered — writing a `ConversationParticipant` row per recipient doesn't scale and isn't needed. Instead:
- `HOTEL_ANNOUNCEMENT` / `GLOBAL_ANNOUNCEMENT` conversations only have participant rows for the **senders** (hotel staff, or platform admin), each with `canReply: false` set on the implicit audience side — there is no audience-side row at all. Any customer/guest can *read* an announcement conversation matching their hotel (or any global one) via a query, not a join to a per-recipient row: `WHERE type = 'HOTEL_ANNOUNCEMENT' AND hotelId = :customersRecentHotelId` or `WHERE type = 'GLOBAL_ANNOUNCEMENT'`.
- Unread state for announcements is tracked client-side (last-seen message id/timestamp cached locally, same identity — `customerId` or `guestIdentityId` — used to key it), not as a server-side row per recipient. This keeps the write path O(1) regardless of audience size, which is the actual design constraint a broadcast feature has to satisfy.
- `DIRECT`, `GROUP`, and `SUPPORT` conversations *do* get one participant row per actual participant, since those are small, known, bounded sets — this is the normal case and needs no special handling.

### Conversation type → who can create it, who's in it

| Type | Created by | Participants | Reply direction |
|---|---|---|---|
| `DIRECT` | Either side | Exactly 2 (e.g. customer ↔ their hotel's staff about their own order) | Two-way |
| `GROUP` | Hotel admin/staff | N hotel staff of the same hotel | Two-way |
| `HOTEL_ANNOUNCEMENT` | Hotel admin/staff | Sender-only rows; audience = that hotel's customers by query | One-way |
| `GLOBAL_ANNOUNCEMENT` | Platform admin only | Sender-only rows; audience = everyone by query | One-way |
| `SUPPORT` | Customer, or hotel staff | Customer/guest or hotel staff ↔ platform admin(s) | Two-way |

### Tenant isolation
- `DIRECT`/`GROUP`/`HOTEL_ANNOUNCEMENT`/hotel-initiated `SUPPORT` carry `hotelId`; every query for hotel staff filters by their own `hotelId`, same rule as every other v1.2.0 hotel-scoped table — a hotel's staff can never list another hotel's conversations.
- `GLOBAL_ANNOUNCEMENT` and the platform side of `SUPPORT` have `hotelId: null` by design — this is the one deliberate cross-tenant surface, visible only to `PLATFORM_ADMIN` participants, exactly mirroring how `/platform` already works in v1.2.0. Document this exception inline in `schema.ts` so it doesn't read as a leak on a future audit.

### Delivery model — DB is the source of truth, WS is a live-push convenience
Persisted `Message` rows are authoritative; a client that was offline when a message was sent simply fetches conversation history via `GET /messaging/conversations/:id/messages` on reconnect. This means, unlike SMS (Part 2 of the v1.2.0 plan), messaging does **not** need the outbox/retry pattern — there's no "delivery" to guarantee beyond "it's in the database," which a normal transactional write already gives you. WS is purely for sub-second live push to whoever's currently connected; nothing is lost if it's not connected.

Three-state tick model (WhatsApp-style), computed rather than separately stored:
- **Sent** — row exists in `Message`.
- **Delivered** — the WS push to at least one other participant's currently-open socket succeeded (tracked in-memory by the hub at push time, not persisted — this is presence-level information, not a durability guarantee).
- **Read** — the recipient's `ConversationParticipant.lastReadAt` is at or after the message's `createdAt`, updated when they open/scroll to that conversation.

### Typing indicator
Ephemeral, never persisted: `TYPING_START` / `TYPING_STOP` WS events scoped to a conversation channel, broadcast only to other participants currently connected to that conversation. Client auto-clears a stale "typing" state after a few seconds of no update (covers the case where a `TYPING_STOP` never arrives, e.g. the sender's tab closes).

### WebSocket scoping (`messaging/websocket.ts`)
Extends the existing `wsHub` pattern from v1.2.0 rather than replacing it — same hub, new channel dimension:
- On connect, a socket registers with its participant identity (`customerId` / `guestIdentityId` / `adminUserId` / `platformAdminId`) resolved server-side from the auth token or `X-Guest-Id` header — never trusted from a client-supplied query param, same rule v1.2.0 applied to `hotelId` scoping.
- Joining a conversation channel requires the server to first verify that identity is actually a participant (or, for announcements, that the hotelId/global scope matches) — reject the subscription otherwise. This is where tenant isolation is actually enforced for messaging; the schema-level `hotelId` filtering above is necessary but not sufficient without this check at connection time.

### API surface (`messaging/routes.ts`)
- `GET /messaging/conversations` — list the caller's conversations (resolved by their identity: customer/guest/staff/platform token), plus the queried announcement conversations for their hotel/global scope.
- `POST /messaging/conversations` — create a `DIRECT`, `GROUP`, or `SUPPORT` conversation (role-gated per the table above).
- `GET /messaging/conversations/:id/messages` — paginated history.
- `POST /messaging/conversations/:id/messages` — send (rejected server-side if `canReply: false` resolves for the sender's participant record, i.e. someone trying to reply into a one-way announcement).
- `POST /messaging/conversations/:id/read` — updates `lastReadAt`.
- `POST /messaging/announcements` — hotel-staff or platform-admin only; creates a `HOTEL_ANNOUNCEMENT`/`GLOBAL_ANNOUNCEMENT` with sender-only participant rows and the first `Message`.

### UI
WhatsApp-inspired customer/kitchen chat surfaces: message bubbles (sender-aligned left/right), timestamp per message, typing indicator ("Hotel is typing..." / staff name), unread badges on the conversation list, three-tick sent/delivered/read on the customer side. New announcement conversations render distinctly (banner-style, no reply composer) rather than as a normal thread, since they're one-way.

---

## Execution order for v1.3.0

1. **Part 1** — guest identity (`X-Guest-Id`, `GuestIdentity` table, header plumbing in `apiGet`/`apiPost`). Small, additive, unblocks everything else needing an identity for non-account customers.
2. **Part 2 schema** — `Conversation`/`ConversationParticipant`/`Message`, additive migration.
3. **Part 2 backend** — `messaging/` module: service + routes for `DIRECT`/`GROUP`/`SUPPORT` first (bounded-participant case is simpler), then announcements (query-based audience, no fan-out).
4. **WS layer** — extend `wsHub` with conversation channels + typing events, gated by the participant-verification check above.
5. **UI** — chat surfaces on customer and kitchen sides, wired to the REST + WS layers from 3–4.

Don't build announcements before `DIRECT`/`GROUP` — the query-based audience model only makes sense once the bounded-participant case is working and you can see the contrast in the codebase, and it's the part most likely to need a second pass once real usage patterns show up (e.g. do hotels want to target a subset of customers, not just "everyone who ordered from us" — that's a real open question worth deferring until the simple case ships and you have a concrete reason to complicate it).
