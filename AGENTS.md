PRODUCTION SAFETY

This application is currently serving real users.

Before modifying any code:

- Identify every affected module.
- Consider migration impact.
- Consider backward compatibility.
- Preserve existing APIs unless versioned.
- Never break production functionality to implement a new feature.
- Prefer additive changes over destructive changes unless really necessary for product improvement.
- If a migration could lose data, stop and propose a migration strategy before generating code.

# tableDash — Code Review + Implementation Plan

Repo reviewed: `hackden3618/tabledash` @ `main` (25 commits). Stack: Bun + Elysia API, Prisma/Postgres, React/Vite web (no router — state-machine SPA), Railway deploy, single `AdminUser` table, hand-rolled WS hub.

This doc is written so **any model or dev picking it up mid-stream can execute it without re-deriving context**. Follow phase order — later phases assume earlier ones are merged. Each item lists: root cause (with file:line-ish references), fix spec, and files touched.

---

## Part 1 — Review Findings (CodeRabbit-style)

| # | Severity | File | Finding |
|---|----------|------|---------|
| 1 | 🔴 Critical | `apps/api/src/modules/orders/service.ts` (`updateOrderStatus`) | Cancelling an order never restores `Product.stockQty`. Stock decremented at order time is permanently lost on cancellation — items go artificially "out of stock." |
| 2 | 🔴 Critical | `apps/api/src/modules/orders/service.ts` (`getDashboardMetrics`) | `totalSales += Number(order.totalAmount)` runs for **every** order regardless of status — cancelled orders inflate revenue. `pendingOrders` count is also `status !== CANCELLED` catch-all, not an explicit allow-list. |
| 3 | 🟠 High | `prisma/schema.prisma` (`Order`) | No payment fields (`paymentStatus`, `amountPaid`). No way to mark partial/full/unpaid, so front-of-house can't reconcile cash at day-end. |
| 4 | 🟠 High | `prisma/schema.prisma` (`EventOutbox`) | Model exists (`event_outbox` table, migration `20260723075129_add_events`) but is **never referenced** anywhere in `apps/api` — confirmed via repo-wide grep. Dead table; SMS dispatch bypasses it entirely and is fire-and-forget (`Promise.all(...).catch(console.error)` in `placeOrder`), so a gateway outage silently drops the alert with no retry and no record it failed. |
| 5 | 🟡 Medium | `apps/web/src/pages/customer/LocationPage.tsx` (`handlePlaceOrder`) | Submit button `disabled` only checks phone validity — customer name is validated *after* click (via modal), not in the disabled predicate. Location/stall data isn't required at all. |
| 6 | 🟡 Medium | `apps/web/src/pages/customer/LocationPage.tsx` | Map entry point (`MarketMapModal`) is fully interactive/live today, but there's no persisted stall-number field distinct from the freeform `locationDescription` textarea. |
| 7 | 🟡 Medium | `apps/api/src/modules/settings/service.ts` (`getHotelIsOpen`/`updateHotelIsOpen`) | Hotel open/closed is a single global `Setting` row — correct for single-tenant, but there is no concept of per-vendor closed state, and the web app has no "closed hotel" section for menu items — closed just blocks *new* orders globally, not per-item cart eligibility. |
| 8 | 🟡 Medium | `prisma/schema.prisma` (`Product`) | No `lastRestockedAt` / `outOfStockSince` timestamp. Can't show freshness or "low stock for Xh" signals. |
| 9 | 🟢 Low | `apps/api/src/modules/auth/service.ts`, `AdminUser` | Flat admin table, no `role` column, no tenant scoping — blocking dependency for the multi-tenant ask (Part 1 item below). |
| 10 | 🟢 Low | `apps/api/src/modules/websocket/hub.ts` | `broadcastToAdmins` sends to *every* admin socket process-wide — fine single-tenant, becomes a cross-tenant data leak once multiple hotels exist if not scoped. |

---

## Part 2 — Priority-Ordered Implementation Plan

**Ordering rationale:** ship the money-accuracy and reliability bugs first — they're additive, low-risk, deployable today without touching the data model's shape. The multi-tenant rebuild (your item 1) is the largest, riskiest change and should land *last*, built on top of the now-correct single-tenant logic so tenancy is just "the same correct logic, scoped by `hotelId`." Doing multi-tenancy first would mean re-testing all these fixes twice.

### P0 — Ship immediately (additive migrations only, no breaking changes)

#### P0.1 — Cancellation must revert stock and exclude from sales (your item 3, high criticality)
- **Schema (additive):** add to `Order`: `paymentStatus PaymentStatus @default(UNPAID)`, `amountPaid Decimal @default(0) @db.Decimal(10,2)`. New enum `PaymentStatus { UNPAID PARTIAL PAID }`.
- **Logic — `updateOrderStatus`:** when `newStatus === "CANCELLED"`, wrap in a `$transaction` that, for each `OrderItem` on the order, does `product.update({ stockQty: { increment: item.quantity } })` and re-flips `available: true` if it was auto-disabled at 0. Do this atomically with the status write so a crash mid-way can't desync stock vs. status.
- **Logic — `getDashboardMetrics`:** change `totalSales` accumulation to `if (order.status !== "CANCELLED") totalSales += Number(order.totalAmount)`. Make `pendingOrders` an explicit allow-list (`NEW, ACCEPTED, PREPARING, READY_FOR_DELIVERY, OUT_FOR_DELIVERY`) instead of a catch-all, so a future status addition doesn't silently get miscounted.
- **New endpoint:** `PATCH /orders/:id/payment` → `{ paymentStatus, amountPaid }`, staff-only, no forward-only constraint (payment status isn't a pipeline stage).
- **New view — daily order history:** `GET /orders?date=YYYY-MM-DD` returning all orders for that day with `paymentStatus`/`amountPaid` surfaced, so admin can mark full/partial/unpaid inline. Add this list to `AdminOrdersPage.tsx` or a new `AdminOrderHistoryPage.tsx` with a date picker (default today) and a per-row payment-status pill + tap-to-edit amount.
- **Files:** `prisma/schema.prisma`, new migration, `orders/service.ts`, `orders/route.ts`, `shared/types.ts` (`DashboardMetrics`, `OrderData`), `AdminOrdersPage.tsx`/new history page.

#### P0.2 — Reliable SMS dispatch via the outbox table that already exists
- Currently `EventOutbox` is schema-only dead weight. Wire it in instead of building a new mechanism.
- **Logic:** inside the same `$transaction` that creates the `Order` in `placeOrder`, also `tx.eventOutbox.create({ eventName: "order_created", payload: JSON.stringify({orderId, ...}), status: "initialized" })`. This guarantees the "an SMS needs to go out" fact is durably committed atomically with the order — even if the SMS gateway or process dies immediately after, the record survives.
- **Dispatcher:** a small poller (setInterval, e.g. every 2–5s, or a Bun cron-style loop in `server.ts`) that selects `status: "initialized"` or `"pending"` rows, attempts `smsService.sendSms`, and marks `status: "done"` + `completedAt` on success, or `"pending"` (retry) with a capped attempt count on failure. This is what makes it "reliable especially if offline" — the SMS attempt isn't tied to the single request lifecycle; it keeps retrying independent of whether the initial dispatch succeeded.
- Keep the existing immediate fire-and-forget `smsService.sendSms` call as the "fast path" for the common case (still fire it right away), but *also* write the outbox row — the poller only needs to act on rows still `initialized`/`pending` after a short grace window, so successful fast-path sends don't get double-sent (mark `done` immediately after the fast path succeeds too).
- **Files:** `orders/service.ts`, new `apps/api/src/modules/notifications/outbox-dispatcher.ts`, `server.ts` (start the poller), `prisma/schema.prisma` (add `attempts Int @default(0)` to `EventOutbox` for retry capping).

#### P0.3 — Lock actions on insufficient data (your item 5)
- **`LocationPage.tsx`:** change the submit button's `disabled` predicate to require name, valid phone, *and* either a map-selected section or a non-empty stall/location description — not just phone.
- **`AdminLoginPage.tsx`, any other form-gated action:** audit for the same pattern — disable the action button by predicate, don't rely solely on post-click validation modals. Post-click modals stay as the user-facing error explanation; the disabled state is the actual gate.
- **Files:** `LocationPage.tsx`, `AdminLoginPage.tsx`, any other submission forms found during audit (`AdminMenuManagePage.tsx` product create/edit, `AdminSettingsPage.tsx` staff add).

#### P0.4 — Disable cart-add for closed hotel, move to separate section (your item 6)
- **Logic:** `MenuListPage.tsx` already presumably polls/subscribes to `HOTEL_STATUS_UPDATED` via WS (confirm on read) — use `isOpen` to (a) disable "add to cart" controls on every product card, and (b) if the hotel is closed, group all of its items under a visually distinct "Currently Closed" section instead of interleaving with open items.
- Once multi-tenant lands (P1), this becomes per-hotel rather than global — build it against a `hotel.isOpen` boolean so the P1 migration is a rename, not a rewrite.
- **Files:** `MenuListPage.tsx`, its product-card component.

#### P0.5 — Lock map, add stall-number placeholder (your item 4)
- Replace the live `MarketMapModal` entry point with a locked/disabled state (e.g. grayed card, "Map coming soon — tap to enter your stall details instead," or keep it tappable but show an interstitial explaining the map isn't ready and route straight to the text field).
- Add a dedicated **stall number** input (separate from the freeform `locationDescription` textarea) with placeholder text like `"e.g. Stall 42, or 'Kwa Apples, opposite main gate'"`. Store it in the existing `locationDescription` field for now (schema already supports free text) or add a new `stallNumber String?` column if you want it queryable/filterable separately — recommend the latter since it's structured data staff will search/sort by.
- **Files:** `LocationPage.tsx`, `MarketMapModal.tsx` (or its call site), optionally `prisma/schema.prisma` + migration for `stallNumber`.

#### P0.6 — Freshness timestamps (your item 7)
- **Schema (additive) on `Product`:** `outOfStockSince DateTime?`, `lastRestockedAt DateTime? @default(now())`.
- **Logic — `updateProductStock`:** when the update transitions `stockQty` from `>0` to `<=0`, set `outOfStockSince: new Date()`. When it transitions from `<=0` to `>0` (restock), clear `outOfStockSince: null` and set `lastRestockedAt: new Date()`. When stock is incremented as part of a **cancellation revert** (P0.1), do **not** touch `lastRestockedAt` — spec explicitly excludes cancellation reversals from the "freshness" signal since it's not a real restock.
- **UI:** show "Out of stock for Xh Ym" on the customer menu card when `outOfStockSince` is set; show "Restocked Xh ago" or similar on admin menu management.
- **Files:** `prisma/schema.prisma`, migration, `menu/service.ts` (`updateProductStock`), `orders/service.ts` (make sure the P0.1 stock-revert path uses a distinct code path/flag so it skips the `lastRestockedAt` bump), `MenuListPage.tsx`, `AdminMenuManagePage.tsx`.

---

### P1 — Multi-tenant platform (your item 1)

This is the big one. Sequence sub-phases in order; each is independently deployable.

#### P1.a — Schema: introduce the tenant boundary
- New `Hotel` model: `id, name, slug, isOpen, autoCloseAt, createdAt, deletedAt?`. This absorbs the current global `hotel_is_open`/`auto_close_at` `Setting` rows — one row per hotel instead of two global settings rows.
- New `PlatformAdmin` model, separate table from `AdminUser` (don't overload one table with two trust levels — keeps the platform panel's auth completely decoupled from any hotel's staff auth, so a bug in hotel-scoped code can't escalate into platform access).
- Add `hotelId String @db.Uuid` (FK to `Hotel`) to: `Product`, `Order` (denormalized even though it's derivable via order items, for cheap tenant-scoped queries), `AdminUser`, `StaffUser`, `Setting` (or retire `Setting` in favor of columns on `Hotel` — recommended, since every current `Setting` row is hotel-level, not truly global).
- Add `role` to `AdminUser`: enum `HotelRole { HOTEL_ADMIN HOTEL_STAFF }` — this is the "initial main hotel management staff who will add their own staff" hierarchy from your spec: first `AdminUser` for a hotel is seeded as `HOTEL_ADMIN` by a platform admin; that admin can then create further `AdminUser` rows scoped `HOTEL_STAFF` for their own hotel only.
- **Data migration:** create one `Hotel` row for "Wambu's Corner Hotel" from existing settings, backfill `hotelId` on every existing `Product`/`Order`/`AdminUser`/`StaffUser` row to point at it. Zero data loss, zero downtime if done as: add nullable FK → backfill → make non-nullable in a follow-up migration.

#### P1.b — Auth & RBAC
- Two independent JWT issuers/audiences: platform admin tokens (`/platform` login) and hotel-staff tokens (`/kitchen` login, unchanged path). Middleware on every hotel-scoped route resolves `hotelId` from the authenticated staff token and injects it into every Prisma `where` clause — never trust a `hotelId` passed in the request body/query for a staff-authenticated call.
- Platform admin routes never touch hotel-scoped data directly except through explicit "as hotel X" admin actions (create hotel, seed its first `HOTEL_ADMIN`, suspend a hotel) — platform admins are not a backdoor into every hotel's order data by default; if you want support-style "view as," make it an explicit, logged action.

#### P1.c — `/platform` panel (new)
- Separate route/bundle from `/kitchen`, gated by `PlatformAdmin` auth only.
- Features: list/create/suspend hotels, seed each hotel's first `HOTEL_ADMIN` (username + temp password, forced reset on first login), platform-wide metrics rollup (sum of all hotels' dashboards), audit log of platform-admin actions.
- Treat this as your highest-security surface: shorter JWT expiry than hotel staff, no password-reset-via-SMS shortcuts, log every login and every hotel-creation/suspension action.

#### P1.d — `/kitchen` stays, becomes tenant-scoped
- Existing `/kitchen` UI/routes are unchanged in shape — the only change is every query is now implicitly filtered by the logged-in staff's `hotelId` via the middleware from P1.b. `HOTEL_ADMIN` can additionally manage `StaffUser` rows (their own hotel's staff), same UI pattern as today's `AdminSettingsPage.tsx` staff list, just tenant-filtered.

#### P1.e — Customer marketplace UI
- `MenuListPage.tsx` becomes cross-hotel: fetch `Product` across all `Hotel`s where `isOpen`, group by hotel with a hotel name/badge per section (closed hotels move to the "Currently Closed" section from P0.4, now per-hotel instead of singleton).
- **Decision needed from you before building this:** can a single cart/order span items from multiple hotels, or is checkout restricted to one hotel per order (simpler, avoids splitting SMS/fulfillment/payment across vendors mid-order)? Recommend **restricting one hotel per order** initially — it keeps P0.1–P0.6's per-order logic valid unchanged, and multi-hotel cart is a distinct feature you can layer on later (e.g. auto-split into N orders at checkout, one per hotel, shown to the customer as "N deliveries").
- `Order.hotelId` (from P1.a) drives which hotel's staff get the SMS/WS broadcast.

#### P1.f — WS hub tenant scoping
- Change `broadcastToAdmins` to `broadcastToHotelAdmins(hotelId, message)`, filtering `this.clients` by both `role === "admin"` and a `hotelId` the socket registered with (passed as a WS query param, resolved server-side from the staff JWT — don't trust a client-supplied `hotelId` for which channel they join).

#### P1.g — Deployment note
- Recommend staying on the current single Postgres database with row-level `hotelId` tenancy (not DB-per-tenant) given the team size and Railway single-instance deploy already in `railway.toml`/`Dockerfile` — DB-per-tenant would multiply ops overhead for little isolation benefit at this scale, and Prisma's `hotelId`-scoped middleware gives you the isolation guarantee that matters (no cross-tenant query leakage) without the infra cost.

---

## Execution Rules (for whichever model/dev picks this up)

1. Work top-to-bottom: P0.1 → P0.6, then P1.a → P1.g. Don't start P1 until all P0 items are merged and deployed — P1 migrations assume the corrected stock/sales/payment logic already exists.
2. Every schema change is a new additive Prisma migration — never edit a migration that's already been applied in prod. Nullable-first, backfill, then tighten constraints in a follow-up migration.
3. One numbered item (P0.1, P0.2, ...) = one PR. Don't bundle unrelated fixes even though they're all "urgent" — this repo has 25 commits total and no CI/tests visible, so small PRs are the only safety net until tests exist.
4. Before P1, write at least smoke-level tests for `placeOrder`, `updateOrderStatus`, and `getDashboardMetrics` — these are the functions P1 will refactor most invasively (adding `hotelId` filters everywhere), and they currently have zero test coverage in the repo.
5. If a step's file references above are stale by the time you implement it (repo may have moved on), re-grep for the function name rather than assuming the line location — this doc was written against `main` as of 2026-07-24.


# tableDash → TableDash Deliveries — Implementation Plan v2

Supersedes `tabledash-review-and-plan.md`. This version incorporates: event-driven architecture built on the existing `EventOutbox` table (not just SMS-for-orders), a cart that can span multiple hotels with auto-partitioned checkout, SMS coverage for platform/admin lifecycle events, and the brand split between the platform (**TableDash Deliveries**) and each tenant (**Hotel.name**, e.g. "Wambu's Corner Hotel").

Priority order for every decision below, high to low, never traded down: **0. protect current production behaviour → 1. data integrity → 2. tenant isolation → 3. maintainability → 4. readability → 5. performance.**

---

## Part 1 — Findings still standing from the original review

Unchanged from the prior review (root causes verified against `main`):
- Cancellation never restores `Product.stockQty`.
- `getDashboardMetrics` counts cancelled orders as revenue.
- `EventOutbox` exists in the schema (migration `20260723075129_add_events`) but has zero references in `apps/api` — this review now treats it as the intended backbone rather than dead code (see Part 2).
- `Order` has no payment fields.
- `LocationPage.tsx` disables submit only on phone validity, not name/location.
- Map is live/interactive with no dedicated stall-number field.
- `Product` has no restock/freshness timestamps.
- `AdminUser` is flat — no role, no `hotelId`.
- "Wambu's Corner Hotel" is hardcoded in `orders/service.ts` SMS strings and settings error messages — this is now a correctness bug, not cosmetic: it must become `hotel.name`, and the platform-level brand (**TableDash Deliveries**) must be introduced as a separate identity. Ownership of the *platform* moves to TableDash Deliveries; each hotel keeps its own name as the tenant-facing brand customers and that hotel's staff see.

---

## Part 2 — Event-driven core (the backbone everything else sits on)

`EventOutbox` should be the **transactional outbox** for the whole app, not a single-purpose SMS queue. Build this once, first, before Feature 1–7, because tenant creation, staff creation, and multi-hotel checkout all need to emit events through it.

### Schema

```prisma
enum EventName {
  order_created
  order_status_updated
  order_payment_updated
  menu_availability_updated
  hotel_created
  hotel_status_updated
  hotel_admin_created
  hotel_staff_created
}

model EventOutbox {
  id          String      @id @default(uuid()) @db.Uuid
  eventName   EventName   @map("event_name")
  payload     String      @db.Text
  status      EventStatus @default(initialized)
  attempts    Int         @default(0)
  hotelId     String?     @map("hotel_id") @db.Uuid   // null = platform-level event
  lastError   String?     @map("last_error")
  createdAt   DateTime    @default(now()) @map("created_at") @db.Timestamptz()
  completedAt DateTime?   @map("completed_at") @db.Timestamptz()

  @@index([status])
  @@map("event_outbox")
}
```
Additive migration: add `attempts`, `hotelId`, `lastError` to the existing table; extend `EventName`.

### Rule: every state change that needs a side effect writes its outbox row in the same `$transaction` as the state change.

This is the actual guarantee the pattern exists for — "the order was placed" and "an SMS needs to go out about it" either both commit or neither does. No code path should call `smsService.sendSms` directly from a route handler outside this pattern.

### Dispatch: immediate path + outbox as the safety net

Feature 2's required flow — commit → emit event → dispatch immediately → retry via outbox — maps to:

1. After the transaction commits, the calling service (e.g. `placeOrder`) calls an in-process `eventBus.publish(eventId)` — a plain function call, not a queue — which looks up the just-written outbox row and attempts dispatch synchronously in the background (failure here is swallowed at this layer only, since the poller is the safety net).
2. A separate poller (`notifications/dispatcher.ts`, started once in `server.ts`) runs every 2–5s, selects `status IN (initialized, pending)` rows older than a few seconds (so it doesn't race the fast path), dispatches, and marks `done` or increments `attempts`/sets `pending` with backoff, capping retries (e.g. 5 attempts, then `status: failed` with `lastError` set, surfaced in `/platform` as a dead-letter view).
3. Dashboard/WS connectivity never gates this — the poller is a plain server-side loop independent of any connected client, so "dashboard visibility must never affect notification delivery" is satisfied by construction: the WS broadcast (`wsHub.broadcastToAdmins`) and the SMS dispatch are two independent consumers of the same committed state, not a chain where one depends on the other.

### One handler per event, one file each

`notifications/handlers/` — `order-created.handler.ts`, `order-status-updated.handler.ts`, `hotel-created.handler.ts`, `hotel-admin-created.handler.ts`, `hotel-staff-created.handler.ts`. Each: parse payload, build message (hotel-branded or platform-branded per Part 3), call `smsService.sendSms`, return success/failure to the dispatcher. New event types are additive — new handler file + one new `EventName` value, no existing handler touched.

---

## Part 3 — SMS coverage for platform/admin lifecycle (new requirement)

Each of these is an `EventOutbox` row + handler, per Part 2 — not a bespoke code path:

| Event | Recipient | Why |
|---|---|---|
| `hotel_created` | The new hotel's seeded `HOTEL_ADMIN` | They need their initial login and may be offline when the platform admin sets them up — same reliability reasoning as order SMS. |
| `hotel_created` | Platform admins (optional, configurable) | Audit visibility of onboarding activity without requiring dashboard access. |
| `hotel_admin_created` | The new admin | Welcome + login instructions. |
| `hotel_staff_created` | The new staff member | Welcome + login instructions. Not fanned out to other staff — the audit log (Part 5) covers the "who added whom" trail; SMS stays reserved for the person who needs to act on it. |
| `hotel_status_updated` (platform-forced suspend only, not the hotel's own toggle) | That hotel's `HOTEL_ADMIN`(s) | An unusual, urgent event they should know about even if not logged in. |

Message branding: platform-originated events (`hotel_created`, admin/staff welcome) are signed **"TableDash Deliveries"**; hotel-scoped operational events (new order, order status) stay signed with `hotel.name`, unchanged from today's behaviour for existing customers.

---

## Part 4 — Data-integrity fixes (Priority 1, ship first, additive only)

- **Cancellation stock revert + sales exclusion:** cancel path restores `stockQty` per item inside the same transaction as the status write; `getDashboardMetrics` explicitly excludes `CANCELLED` from revenue and uses an allow-list for `pendingOrders` rather than a catch-all.
- **Payment tracking:** `Order.paymentStatus (UNPAID|PARTIAL|PAID)`, `Order.amountPaid`, derived `balance = totalAmount - amountPaid`. New `PATCH /orders/:id/payment`. Daily order-history view with inline payment-status editing.
- **Analytics correctness:** dashboard must report completed/delivered count, revenue (cancelled excluded), outstanding balance total (sum of `balance` across unpaid/partial orders), cancelled count (kept visible historically, never deleted), and average order value (revenue ÷ non-cancelled order count).
- **Freshness timestamps:** `Product.lastRestockedAt`, `Product.lastSoldAt`. Updated on genuine restock/sale events; **the cancellation stock-revert path must not touch either field** — route it through a distinct internal function (`restoreStockFromCancellation`) that only touches `stockQty`, never the timestamps, so the two code paths can't accidentally merge in a future refactor.
- **Validation locking:** disabled-predicate on every submit action checks all required fields, not just one; backend validation is authoritative regardless of what the frontend allows through (re-validate name/phone/items/stock server-side in `placeOrder` regardless of what the disabled state let past).
- **Hotel availability:** closed hotel's products stay visible but disabled with "Currently Closed," grouped separately — reads per-`Hotel.isOpen` once Part 5 lands, not a global setting.
- **Temporary location workflow:** map stays disabled with "Market mapping coming soon," stall number + location description collected as structured fields (`stallNumber`, `locationDescription`) that remain compatible with a future real map — keep them as two distinct fields, don't conflate into one freeform blob.

---

## Part 5 — Tenant isolation (Priority 2): Hotel as tenant root

### Schema
- `Hotel { id, name, slug, isOpen, autoCloseAt, createdAt, deletedAt? }` — absorbs today's global `hotel_is_open`/`auto_close_at` settings rows, one per hotel instead of two global rows.
- `PlatformAdmin` — separate table from `AdminUser`, deliberately not unified, so a bug in hotel-scoped code has no path to platform privilege.
- `AdminUser` gains `hotelId` (FK) and `role: HOTEL_ADMIN | HOTEL_STAFF`.
- `Product`, `Order`, `StaffUser` gain `hotelId`.
- Migration path: add nullable `hotelId` → backfill every existing row to a single `Hotel` row seeded from current data ("Wambu's Corner Hotel") → tighten to non-nullable in a follow-up migration once backfill is verified. Zero downtime, reversible at each step, current production data untouched.

### Enforcement
- Tenant filtering happens in backend service functions, never left to frontend filtering — every hotel-scoped Prisma query takes `hotelId` from the authenticated staff JWT, never from request body/query params.
- Authorization hierarchy, enforced server-side at the route layer, not just UI hiding: platform users can create hotels and hotel admins; hotel admins can create hotel staff; hotel staff cannot create any admin account, platform or hotel-level.
- WS hub: `broadcastToAdmins` becomes `broadcastToHotelAdmins(hotelId, message)`, filtered by a `hotelId` resolved server-side from the socket's staff JWT at connection time — never a client-supplied value.

### Multi-hotel cart, single checkout, per-hotel orders

The cart spans hotels; checkout is one customer action; fulfillment is fully partitioned by tenant:

- `Checkout { id, customerId, createdAt }` — new model. `Order.checkoutId` FK.
- `placeOrder` groups `input.items` by `product.hotelId`, then inside one top-level `$transaction`: creates the `Checkout` row, then one `Order` per represented hotel with its own line items, total, and stock decrements — same per-item validation as today, just partitioned by hotel first.
- Each per-hotel `Order` gets its own `order_created` outbox row → that hotel's staff get their own SMS, scoped to their own slice only. Hotel A never learns anything about hotel B's portion of the same checkout — tenant isolation holds even though the customer experienced one checkout.
- Customer-facing confirmation/tracking groups by `checkoutId`: "1 checkout, 2 deliveries," each with its own independent status timeline, since hotel A's order may reach `OUT_FOR_DELIVERY` while hotel B's is still `PREPARING`.
- Customer SMS: one combined placement confirmation summarizing the whole checkout; subsequent status-change SMS stay per-hotel (a customer with a 2-hotel checkout gets two independent "out for delivery" texts, one per hotel, whenever each hotel actually dispatches).

### `/platform` panel
- Separate bundle, gated by `PlatformAdmin` auth only, shorter token expiry than hotel staff.
- Create/suspend hotels, seed each hotel's first `HOTEL_ADMIN`, platform-wide metrics rollup, outbox dead-letter view (Part 2), audit log of every platform action.

### `/kitchen`
- Unchanged in shape; every query implicitly scoped to the authenticated staff member's `hotelId`. `HOTEL_ADMIN` gains a staff-management screen (create `HOTEL_STAFF`, same UI pattern as today's `AdminSettingsPage.tsx`).

---

## Part 6 — Maintainability (Priority 3): module layout

Feature-based, matching the requested structure — treat the reorganization as a byproduct of implementing the features above, not a separate rename-everything commit (a pure rename touches nothing functionally and isn't worth its own review risk at Priority 3, below tenant isolation and data integrity):

```
orders/         controller.ts service.ts schema.ts routes.ts websocket.ts
products/       (rename of today's menu/, done when it gets hotelId added anyway)
hotels/         (new — Hotel CRUD, isOpen/autoClose logic absorbed from settings/)
platform/       (new — PlatformAdmin auth, hotel provisioning, audit log)
notifications/  smsService, dispatcher.ts, handlers/
analytics/      (new — dashboard metrics, extracted from orders/service.ts once payment tracking lands, since metrics logic is a distinct concern from order lifecycle logic)
```
No `BaseService`/`BaseRepository`/generic abstractions — each module stays independently readable; shared conventions (transaction pattern, outbox emission) are documented, not enforced through inheritance.

Every touched file keeps the existing header convention (Purpose/Responsibilities/Dependencies/When to modify) already used throughout this codebase — extend it, don't replace it.

---

## Execution Order

1. **Part 2** — event-driven core (`EventOutbox` extension + dispatcher + handler pattern). Build this first; everything else emits through it.
2. **Part 4** — data-integrity fixes, each wired through Part 2 where it involves a notification (cancellation revert, payment tracking, freshness timestamps, validation locking, hotel-closed UI, location workflow).
3. **Part 5** — tenant isolation (`Hotel`/`PlatformAdmin` schema, RBAC, multi-hotel cart/checkout, `/platform`, `/kitchen` scoping, WS scoping), with Part 3's admin/hotel-lifecycle SMS wired in as each of those entities gets its create-path built.
4. **Part 6** — module reorganization, opportunistically, module-by-module, as each area is touched by 1–3 above.

Do not start step 3 before step 2's dispatcher exists — hotel/admin/staff creation events need somewhere to publish to. Do not start step 4 as a standalone pass.

## Per-feature process (apply to every item above)

1. Identify affected modules and current behaviour.
2. State the implementation plan and migration impact before writing code.
3. Implement the smallest complete solution — no speculative generality.
4. Verify: existing production behaviour preserved / data integrity preserved / tenant isolation preserved / analytics still correct.
5. Review for readability, maintainability, security, and tenant isolation, in that order, before calling the item done.

## Rebrand checklist (do this alongside Part 5, not as a separate pass)

- Remove every hardcoded "Wambu's Corner Hotel" string from `orders/service.ts` and `settings/service.ts`; replace with `hotel.name`.
- Platform-level surfaces (OpenAPI title, `/platform` chrome, platform-originated SMS, app shell footer) say **TableDash Deliveries**.
- Hotel-level surfaces (per-hotel SMS, `/kitchen` header, marketplace hotel badges) say that hotel's own name.
- Completion test: grep the repo for "Wambu" after Part 5 lands — zero results in code, with the sole exception of that hotel's own seeded `Hotel.name` row in the database.

## Phase Omega — Production Readiness & System Hardening

Completed in the most recent work session. All items verified with `tsc --noEmit` + `vite build` passing (exit 0).

### Order Lifecycle State Machine (data integrity)
- Replaced rank-based `STATUS_RANK` check with explicit `ALLOWED_TRANSITIONS` matrix in `orders/service.ts` — impossible transitions (DELIVERED→PREPARING, CANCELLED→any) are blocked by design.
- Added `REFUNDED` to `PaymentStatus` Prisma enum with `refundedAt` column on `Order` — migration `20260729200000_add_refunded_enum`.
- `updateOrderPayment` now guards against payment mutation on `REFUNDED` orders, blocks payment collection on `CANCELLED` orders, and enforces refund semantics.
- `getDashboardMetrics` now tracks `refundsProcessed`, excludes `REFUNDED` from `outstandingBalance`, excludes already-refunded from `refundsDue`.
- `formatOrderResponse` includes `refundedAt`.
- `cancelOrderByCustomer` now passes `hotelId` for correct hotel-branded SMS.
- `updateOrderStatus` resolves hotel name from `existing.hotelId` or `hotelId` param, not hardcoded `getDefaultHotel()`.
- `updateOrderPayment` resolves hotel name from `existing.hotelId`, not `getDefaultHotel()`.
- Updated `shared/types.ts` (`PaymentStatus` + `DashboardMetrics.refundsProcessed` + `OrderData.refundedAt`), `shared/schemas.ts` (REFUNDED in union), `DashboardMetrics` interface (added `refundsProcessed`).

### WebSocket Architecture Hardening
- Fixed order-specific notifications (`OUT_FOR_DELIVERY`, `CANCELLED`) to use `broadcastToIdentity` targeting the specific customer (not `broadcastNotification` which leaked to ALL customers).
- `broadcastToHotelAdmins` + `broadcastToIdentity` now replace `broadcastNotification` for all order lifecycle events.
- Added stale client Sweep every 30s in `WebSocketHub` (removes clients inactive for 60s).
- `broadcastNotification` in `orders/service.ts` no longer used for order events — replaced by targeted sends.
- Fixed `updateOrderPayment` to also use targeted identity sends to customer + hotel admins.

### Tenant Isolation Hardening
- `GUEST` actors in `accessibleConversationWhere` restricted to `PLATFORM_NOTICE` only — no hotel notices, order conversations, or talk-to-staff. GUESTs only see platform announcements unless signed in.
- `platform-notices` route recipient lookup (`getAnnouncementRecipientIdentityKeys`) includes customers across all hotels (platform-wide announcements).
- Messaging route broadcast lookups (`body.hotelId`) replaced with server-validated `result.conversation.hotelId` / `created.hotelId` (`talk-to-staff`, `community-channels`).
- `getOrderById` now accepts optional `hotelId` parameter for future multi-tenant scoping.

### Design Consistency
- Deleted legacy `BottomNavBar.tsx` duplicate (not imported anywhere).
- Deleted legacy `Modal.tsx` (old version without framer-motion — not imported).
- Fixed `PlatformAdminPage.tsx` Modal import to use `../../components/ui/Modal`.
- Fixed `index.css` h1-h6 to use `var(--font-family-display)` (League Spartan) instead of `var(--font-family-base)`.
- Synchronized `AdminBottomNavBar` badge sizing (`min-w-4 h-4 text-[0.55rem]`) and positioning (`-top-2 -right-2.5`) to match `BottomNav`.
- Fixed `AdminBottomNavBar` inactive icon size (was 18px, now 20px) and active indicator width (`w-5` → `w-6`).

### Notification WS Event Handling
- Added `NOTIFICATION` event handler in `App.tsx` (dispatches push toasts for order dispatch/cancellation to the correct scope).
- Added `ORDER_PAYMENT_UPDATED` handler in `App.tsx` (dispatches payment update toasts for admin views with status label and amount).
- Added `HOTEL_CLOSING` handler in `App.tsx` (dispatches closing countdown + closed-toast to correct scope).
- Added `HOTEL_STATUS_UPDATED` handler in `App.tsx` (dispatches open/closed toast to correct scope).
