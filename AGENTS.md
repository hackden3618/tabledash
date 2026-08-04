# LADHA v1.3.0 — Production Engineering Charter (Revised)

## Governing document for every agent working on this codebase

This supersedes the earlier draft charter. It carries forward everything correct in it, corrects one real internal contradiction (flagged below, not silently resolved), and folds in every concrete decision already made and built in this codebase — finance, wallet, notifications, guest identity, messaging, tenant model. An agent picking up any task in this repo should be able to resolve any ambiguity by reading this document alone.

---

## A correction, stated plainly, before anything else

The earlier charter's **Finance Module** section listed Cash Register, Daily Closing, and Cash Reconciliation as v1.3.0 release requirements. That directly contradicts an explicit scope decision already made in this project: *"we do not need opening balances and such... I primarily want all orders that pass through the system to be recorded as an extension of the sales done by a business and customer accounts updated... not to be the full business financial ledger."*

A charter that contradicts a decision its own author already made is worse than no charter — it gives an autonomous agent two authorities that disagree, and no rule for which one wins. This document resolves it: **the till/reconciliation surface is deferred, not deleted.** It's a clean, additive v1.4+ feature once the lighter model below is live and proven in production — it is explicitly **not** a v1.3.0 release blocker. Guiding Principle 9, at the end of this document, exists so a future agent catches this class of contradiction itself instead of silently picking one side.

---

## Mission

Ladha is entering final production hardening. The objective is not to introduce unrelated features — it's to make the platform correct, trustworthy, and boring in the ways that matter (financially, in particular) before it carries a real hotel's daily business. When uncertain between convenience and correctness, choose correctness.

## Product Identity

Ladha is a multi-tenant restaurant operations platform: Marketplace, Ordering, Kitchen Operations, Financial Management, Customer Accounts, Reporting, Announcements, Operational Communication, Platform Administration. It is not a social messaging platform — every communication surface exists to serve one of those operational functions.

## Architecture Principles

- Every domain has exactly one owner. Orders own operational workflow. Kitchen owns preparation. **Finance owns money.** Messaging owns business communication. Platform owns system administration. No domain duplicates another's responsibility.
- Every state change that has a side effect (SMS, in-app notification, downstream balance update) writes an outbox event in the same transaction as the change itself — this is the mechanism, not just the intent, behind "immutable history" and "no dropped notifications." One handler per side effect, in its own file; a single event can fan out to multiple handlers (e.g. one financial event triggers both an SMS handler and an in-app-notification handler) rather than one handler doing two unrelated things.
- No `BaseService`/`BaseRepository`/generic abstractions. Each module stays independently readable.

---

## Finance Is the Source of Truth (release-blocking, scope as corrected above)

Orders never own money. Orders create financial events; Finance records them. Every other module consumes financial state from Finance — nothing recomputes a balance independently.

### Finance module (v1.3.0 scope)

- `SalesRecord` — one immutable row per financial event on an order: `ORDER_CHARGE` (written at order creation), `ORDER_PAYMENT` (written when staff records cash/mpesa received), `REFUND`, `ADJUSTMENT` (manual correction — always its own row, never a silent field edit). `orderId` is a direct required FK.
- `CustomerAccount` — one row per customer per hotel, `totalOwed`/`totalPaid` maintained as an incremental cache alongside each `SalesRecord` write, in the same transaction. Never edited independently of a ledger write.
- Customer Wallet (below).
- The financial-movement notifications (below).

**Explicitly out of v1.3.0 scope**, per the correction above: Cash Register workspace, Daily Closing, Cash Reconciliation, opening balance, till sessions. These require a `BusinessDay`-equivalent concept that the project has deliberately chosen not to build yet. Revisit only as an explicit, separately-scoped v1.4+ decision.

### The two-step flow

Diner Ledger Pro's counter records a sale and its payment in one action because a counter customer pays at the moment of sale. Ladha's orders are placed, then prepared, then paid — so the charge and the payment are genuinely two moments:

1. `placeOrder` writes one `ORDER_CHARGE`, `paymentMethod: CREDIT` ("owed, not yet settled"), inside the existing order-creation transaction. `CustomerAccount.totalOwed` increments same transaction.
2. Staff recording a payment (`POST /finance/orders/:orderId/payments`) writes one `ORDER_PAYMENT` with the actual method (`CASH`/`MPESA`). `CustomerAccount.totalPaid` increments; `Order.paymentStatus`/`amountPaid` (the read-through cache) are recomputed from the sum of that order's `SalesRecord`s and written in the same transaction.

A same-moment cash-on-delivery order is just step 1 immediately followed by step 2 — partial/credit/running-tab orders fall out of the same mechanism rather than needing special-case handling.

### Orders (financially read-only)

Orders display lifecycle, customer, items, delivery, and financial status — but `paymentStatus`/`amountPaid` have no independent setter anywhere in the codebase; the only writer is the Finance transaction above. Supported financial states, surfaced from the ledger: Pending Payment, Partially Paid, Fully Paid, Completed — Outstanding, Cancelled — Unpaid, Cancelled — Refunded.

### Every number must be traceable

`SELECT * FROM sales_records WHERE orderId = :id ORDER BY createdAt` must fully explain any order's financial state. This is the actual audit log for money — not a separate feature to build, a property this design has by construction.

---

## Customer Wallet

Every customer with at least one `CustomerAccount` row has a wallet, reachable without full login via the guest-identity mechanism (below) once they've placed at least one order.

- **Combined balance** at the top — computed at display time as the sum across hotel accounts, never stored. Hidden by default behind an eye-icon toggle, same behavior as M-Pesa's — this toggle is client-only state, not a synced server preference; a wallet screen must never flash real numbers before the person has had a chance to hide them.
- **Per-hotel breakdown** below it — one row per hotel account, including zero-balance ("All settled") accounts rather than hiding them. Tapping a row opens that hotel's own `SalesRecord` history in plain language.
- **Recent financial activity** — the in-app notification feed (below), surfaced here since it's inherently wallet-scoped.

---

## Customer Identity & Verification

Phone number is the day-to-day identity, but it is not the permanent one.

- **Customer Account ID** (e.g. `LD-CUST-000248`) — a permanent, human-readable identifier assigned once at first `Customer` row creation, stored alongside `Customer.id` (the UUID stays the DB key; the account ID is the number a human reads, quotes, or searches by). Phone numbers may change; this never does.
- **Registration for a verified account** requires name, phone, PIN, and SMS OTP verification of that phone. This verified tier is what unlocks credit: **only verified accounts may select Pay Later, own an accumulating `CustomerAccount` balance, or receive financial SMS/notifications.** An unverified guest (phone-only, no PIN/OTP) can still browse, order, and pay on delivery — their `ORDER_CHARGE` and `ORDER_PAYMENT` land in the same transaction, netting to zero owed, so they never carry an outstanding balance without having verified.
- **Guest identity** (the `X-Guest-Id` / `GuestIdentity` mechanism already built) is the browsing/ordering convenience layer beneath this — it lets a phone-only orderer find their own order history across visits on the same device. Becoming a *verified* customer (PIN + OTP) is a distinct, stronger tier layered on top, required specifically for credit — not a prerequisite for ordering at all.

### Identity updates

Changing name or phone requires the customer's PIN; changing phone additionally requires OTP verification of the new number, with the existing number remaining active until that verification succeeds. On success, synchronize automatically across: Customer Profile, Customer Account, Financial Ledger references, Wallet, Notifications, Search, Hotel Customer Lists, Platform Directory. The Customer Account ID and full financial history never change or reset. Record the change in the audit log.

### Checkout — Payment Method section

- Instant Payment — *Coming in Version 2.0*.
- Payment on Delivery — available to guests and verified customers alike.
- Pay Later — verified accounts only; selecting it while unverified prompts the PIN/OTP verification flow rather than silently failing.

For signed-in users, name and phone are read-only at checkout — editable only from the profile, behind the PIN (and OTP, for phone) flow above.

---

## Notifications

Every financial event generates both an in-app notification and an SMS. Confirmed working templates:

**Order charged:**
> Dear {customer.name}, your account has been credited for your order #{order.orderNumber} for hotel {order.hotel.name}, amount: KSh {record.amount}. New outstanding balance is: KSh {account.balance}. We hope you enjoy our services.

**Payment recorded:**
> Dear {customer.name}, your payment has been recorded for your order #{order.orderNumber}, for hotel {order.hotel.name} amount: KSh {record.amount}. New outstanding balance is: KSh {account.balance}. We hope you enjoy our services and come back next time on Ladha Deliveries on {publicLink}.

`account.balance` is that specific hotel's `CustomerAccount` balance — the event is scoped to one hotel's account, matching the tenant model. `publicLink` is the platform's marketplace URL — a platform-brand line at the end of an otherwise hotel-scoped message, consistent with the rebrand split (hotel-signed operational SMS, platform-signed calls-to-action).

Refund and adjustment templates follow the same voice and structure as the two above (same fields: name, order number, amount, new balance) — draft these in the same style when built, and confirm exact wording before shipping rather than inventing a divergent tone.

**In-app notification** — a dedicated `Notification` model, deliberately separate from `Conversation`/`Message` (this is a private, no-reply receipt, not a conversation). Delivered live over the single WS connection when the app is open; persisted regardless, so it's waiting in the wallet's activity feed if missed.

---

## Communication

Supported channels only: Order Conversations, Talk to Staff, Hotel Announcements, Platform Announcements, Hotel Staff Community Channels. No personal one-to-one messaging unrelated to business. Every announcement identifies its source (Platform Administration / that hotel's management) — this is already how the built `ConversationType` enum (`ORDER`, `TALK_TO_STAFF`, `HOTEL_NOTICE`, `PLATFORM_NOTICE`, `HOTEL_COMMUNITY`) is shaped; no further schema change needed here, just consistent source-labeling in the UI.

---

## Real-Time Architecture

One persistent, authenticated WebSocket connection for the entire session — **already correctly built**: `useWebSocket` is invoked from exactly one place (`App.tsx`), not per-page, with ticket-based auth rather than a token in the connection URL. Two genuinely open gaps against this section, carried over from the last review and not yet closed:

- Reconnect currently uses a flat 3-second retry with no cap — needs exponential backoff.
- No missed-event resync or subscription recovery on reconnect — a client that drops for two minutes reconnects fine but silently misses whatever happened in that window until a full page reload. Needs an event-version cursor or equivalent resync-on-reconnect step.

Live-refresh WS events (`LedgerEntryCreated`, `CustomerBalanceChanged`, `PaymentRecorded`, `RefundRecorded`, `WalletUpdated`, `CustomerIdentityUpdated`, and their non-finance counterparts) are a **separate concern from the durable outbox events** used for SMS dispatch — WS pushes are pure live-refresh convenience with no retry guarantee needed (the DB write is already the source of truth), while outbox events specifically exist because SMS delivery does need a retry guarantee. Don't merge these two mechanisms; they solve different problems.

---

## Search, Navigation, Design System

- Marketplace search: fuzzy, covers hotel names, menu items, aliases, categories, nearby ranking, functional quick filters (Breakfast/Lunch/Dinner/Drinks/Desserts). Restaurant search stays scoped to the selected hotel.
- Back navigation restores scroll position, search state, filters, selected tabs, open modal context — no unexpected exits.
- Design system consistency across typography, spacing, inputs, cards, tables, dialogs, bottom sheets, animations, loading/empty/error states.
- **Known, real, still-open item:** two `window.confirm()` calls remain in `InboxPage.tsx` (delete message / delete conversation) — the exact "browser-native alert" this section prohibits, in the one feature most recently built. Close this before calling the design-system pass done; it's cheap and highly visible.

## Media

Pluggable storage abstraction (`local`/`s3`/`r2`) is already built. **Verify, don't assume**, that the production Railway environment actually sets `MEDIA_STORAGE=r2` — the code defaults to `local` if unset, which is exactly the "depend on Railway's ephemeral filesystem" failure mode this section exists to prevent, and it would fail silently (works in dev, quietly loses uploads after a prod redeploy).

## Platform Administration

Visibility into hotels, orders, financial metrics, audit logs, system health, announcements. Version 2.0 placeholders (Instant Payments, Automatic Settlements, Payment Gateway, Settlement Dashboard) should read as intentional and informative, not as missing functionality.

## Security

Authentication, authorization, tenant isolation, input validation, rate limiting, upload validation, WebSocket authorization — all enforced server-side, never left to frontend filtering. **Known, real, still-open item:** `hotelId` is currently nullable on `Product`, `Order`, `AdminUser`, `StaffUser`, `Media`. A nullable tenant key is a live isolation risk — once backfill is verified complete, tighten these to non-nullable. This is the single highest-priority open item under this section. Sensitive financial actions (Pay Later selection, identity/phone change, manual adjustments) require PIN confirmation as specified above.

## Accessibility & Performance

Mobile-first, touch-friendly, keyboard-accessible, responsive, efficient rendering, lazy loading, image optimization — verify, don't assume.

---

## Production Verification / Release Gate

Ladha v1.3.0 may be frozen only when all of the following are true — this list is checkable against actual repo state, not just aspirational:

- Finance is the sole source of financial truth; `Order.paymentStatus`/`amountPaid` have no independent setter. **(Built, verified in `orders/service.ts` and `orders/logic.ts`.)**
- Customer accounts are ledger-driven via `SalesRecord`/`CustomerAccount`. **(Design complete; implementation per the two-step flow above.)**
- Customer identity is verified (PIN + OTP) for anyone accumulating a balance; unverified guests never carry outstanding balance. **(New requirement, not yet built.)**
- Customer Account ID exists as a permanent identifier independent of phone. **(New requirement, not yet built.)**
- One persistent WebSocket connection powers all real-time features. **(Built, verified.)** Exponential backoff and missed-event resync on reconnect. **(Not yet built — real gap.)**
- Multi-tenant isolation verified — including tightening nullable `hotelId` columns to non-nullable. **(Real, open gap.)**
- No browser-native alerts remain. **(Real, open gap — two in `InboxPage.tsx`.)**
- Production media storage confirmed as object storage, not local filesystem, by environment-variable check, not assumption. **(Unverified — action item, not a code change.)**
- Search, navigation, and communication behave consistently; design system applied uniformly.
- Test coverage extends beyond the current two files (`orders/logic.test.ts`, `websocket/hub.test.ts`) to cover RBAC/tenant isolation specifically, since that's both the highest-risk area per this charter and the area with the open nullable-FK issue above.

---

## Version 2.0 Placeholders

Communicated consistently, without exposing incomplete functionality: M-PESA STK Push before order submission, automated hotel settlements, payment gateway integration, platform wallet, digital receipts linked to payment confirmations.

---

## Guiding Principles

1. **One Source of Truth** — each domain owns its data; Finance owns all monetary records.
2. **Immutable History** — record events; never rewrite financial history.
3. **Tenant Isolation** — hotels never see each other's operational or financial data.
4. **Real-Time Consistency, Correctly Layered** — WS pushes are live-refresh convenience; durable outbox events are for guaranteed external delivery (SMS). Don't conflate the two.
5. **Business Correctness** — the software mirrors how restaurants actually operate, including the two-step charge/payment reality of delivery orders (not a direct port of a counter-sale model).
6. **Security by Default** — verify identities, protect sensitive actions (PIN/OTP for credit and identity changes), audit important changes.
7. **Trust Through Transparency** — every order, payment, refund, adjustment, and balance is traceable to a specific ledger row.
8. **Design Cohesion** — every screen feels like it belongs to one product.
9. **Scope Discipline** — a charter section that reintroduces previously-cut scope requires an explicit, visible amendment, not a silent expansion. When this document and an earlier explicit decision disagree, an agent's job is to surface the contradiction and ask which one governs — not to quietly pick a side. (This principle exists because this revision had to do exactly that once already, with the Cash Register/Daily Closing scope above.)
