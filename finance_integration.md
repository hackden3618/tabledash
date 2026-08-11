# ladha Finance Module — Order Sales Ledger (scoped)

Modeled on `Diner-ledger-pro`'s `transactions` table for the discipline pattern (one append-only record per money-moving event, incremental account balances next to it) — not a port of its full scope. This is narrower by design: **it records orders as sales and keeps customer account balances correct. It is not a general business ledger** — no opening balances, no cash/mpesa till, no day-close/reconciliation. If you want that layer later, it's a separate, additive piece — it doesn't need to exist for this to work.

## The inversion you asked for

Today: `Order.paymentStatus`/`amountPaid` are written directly by an "update order payment" endpoint. Order history *is* the financial record. That's backwards.

After this change: a **`SalesRecord`** is the only thing anyone writes to when an order's payment status changes. `Order.paymentStatus`/`amountPaid` become a **read-through cache** — same relationship Diner Ledger's `debtors.totalOwed` has to its `transactions` table (see `updateDebtor` in `db.ts`: the balance is a maintained cache, the transaction log is what actually happened) — but the *only* code path allowed to change the cache is the one that just wrote a `SalesRecord`. Order history displays the cache; it never originates a number.

## Schema

```prisma
enum SalesRecordType {
  ORDER_CHARGE     // the order's charge, written once at order creation
  ORDER_PAYMENT    // cash/mpesa payment received against an order (full or partial)
  REFUND
  ADJUSTMENT       // manual correction — always an audit entry, never a silent field edit
}

enum PaymentMethod {
  CASH
  MPESA
  CREDIT   // "owed, not yet paid" — same meaning as Diner Ledger's credit sales
}

model SalesRecord {
  id             String          @id @default(uuid()) @db.Uuid
  hotelId        String          @db.Uuid
  orderId        String          @db.Uuid
  type           SalesRecordType
  paymentMethod  PaymentMethod
  amount         Decimal         @db.Decimal(10,2)
  note           String?
  createdByAdminUserId String?   @db.Uuid
  createdAt      DateTime        @default(now())

  hotel Hotel @relation(fields: [hotelId], references: [id])
  order Order @relation(fields: [orderId], references: [id])

  @@index([hotelId, createdAt])
  @@index([orderId])
  @@map("sales_records")
}

model CustomerAccount {
  id          String   @id @default(uuid()) @db.Uuid
  hotelId     String   @db.Uuid
  customerId  String   @db.Uuid
  totalOwed   Decimal  @default(0) @db.Decimal(10,2)
  totalPaid   Decimal  @default(0) @db.Decimal(10,2)
  lastUpdated DateTime @updatedAt

  @@unique([hotelId, customerId])
  @@map("customer_accounts")
}
```

No `BusinessDay`, no `OPENING_BALANCE`/`COLLECTION`/`DAY_CLOSE` types, no till session. `orderId` is a direct required FK here (not a loose `referenceType`/`referenceId` pair) — since every row in this table exists *because of* an order, there's no ambiguity to hedge against by keeping it generic.

## The flow — two entries per order, nothing per business day

1. **`placeOrder`** (inside the existing order-creation transaction) writes one `ORDER_CHARGE` `SalesRecord` — `amount: totalAmount`, `paymentMethod: CREDIT` (meaning "owed, not yet settled" — same semantic Diner Ledger uses for a credit sale). `CustomerAccount.totalOwed` increments by the same amount, same transaction, upserting the account row if the customer doesn't have one yet at this hotel.
2. **Staff records a payment** (`POST /finance/orders/:orderId/payments`, replacing today's direct `updateOrderPayment`) — writes an `ORDER_PAYMENT` record with the actual method (`CASH`/`MPESA`). `CustomerAccount.totalPaid` increments by the same amount, same transaction. `Order.amountPaid`/`paymentStatus` (the cache) are recomputed from the sum of `ORDER_PAYMENT` records against that `orderId` and written in the same transaction.

A cash-on-delivery order paid in full the moment it's delivered is just step 1 immediately followed by step 2 — this doesn't add friction to the common case, it just makes partial/credit/running-tab orders (what your original review flagged) fall out of the same mechanism instead of being a special case bolted onto `Order`.

## What "source of truth" enforces

- `Order.paymentStatus`/`amountPaid` lose their own setter. The only place they change is inside this module's payment-recording transaction, as a derived write — never a standalone PATCH.
- Every number on an order is traceable: `SELECT * FROM sales_records WHERE orderId = :id ORDER BY createdAt` explains it completely. Same query shape Diner Ledger's debtor drill-down already uses.
- Manual corrections (a write-off, a mis-entered amount, a refund) always post an `ADJUSTMENT` or `REFUND` record — never a silent field edit. Carried over directly from `clearDebtor()`'s own comment in `db.ts`: *"Do not delete historical debtor records... a manual clearance is an accounting correction, so it must leave an adjustment transaction."*
- `CustomerAccount` gives you, per customer per hotel, "how much do they currently owe" as a live number — the actual thing you need for a running tab or a repeat customer, without needing anything shaped like a till or a business day.

## Migration path

1. Add `SalesRecord`, `CustomerAccount` — pure additions, zero risk to current data.
2. Backfill: for every existing `Order`, write one `ORDER_CHARGE` record and, if `paymentStatus` was already `PAID`/`PARTIAL`, one matching `ORDER_PAYMENT` record for `amountPaid` — makes history consistent before the new code path takes over.
3. Cut `updateOrderPayment` over to write through `SalesRecord` first, order cache second, same transaction — same endpoint shape from the caller's side, different internals.
4. Build the finance-facing views (order-level payment history, per-customer account view) reading only from `SalesRecord`/`CustomerAccount` — never re-deriving anything from raw `Order` fields directly.

Sequence this after the tenant-isolation tightening (non-nullable `hotelId`) from the last review — both new tables carry `hotelId`, so they should land on top of that fix, not before it.# ladha — Customer Wallet + Financial Movement Notifications

Extends `ladha-finance-module-plan.md` (`SalesRecord` + `CustomerAccount`). This covers: the customer-facing wallet screen, and SMS + in-app notification firing on every `SalesRecord` write.

## Wallet screen

**`GET /finance/wallet`** — resolved by identity, same as everything else in guest/customer flow (`Authorization` bearer if logged in, `X-Guest-Id` → `GuestIdentity.customerId` otherwise; if neither resolves to a `Customer` row yet, return an empty wallet, not an error — someone who's never ordered has no accounts anywhere).

```json
{
  "combinedBalance": 850,
  "accounts": [
    { "hotelId": "...", "hotelName": "Wambu's Corner Hotel", "balance": 500, "totalOwed": 1200, "totalPaid": 700, "lastUpdated": "..." },
    { "hotelId": "...", "hotelName": "Mama Njeri's Kitchen", "balance": 350, "totalOwed": 350, "totalPaid": 0, "lastUpdated": "..." }
  ]
}
```
`combinedBalance` is a display-time sum, not a stored number — there's nothing to keep in sync, it's just `accounts.reduce((a,b) => a + b.balance, 0)`. Each hotel's own `CustomerAccount` stays exactly as scoped as everything else in the tenant model; the wallet screen is a customer-side aggregation view, not a new cross-tenant table.

**UI:**
- Combined balance at the top, large — this is the one number that answers "how much do I owe across everywhere," and it's what should be hidden by default.
- **Hide/show toggle** (eye icon, M-Pesa-style): masks all amounts as `KSh ••••` when off. This is a **client-only, local toggle** — same as M-Pesa's, which doesn't sync across devices either — no new server field needed, just component state that defaults to hidden on load (never default to shown; a wallet screen should never flash a real number before the person's had a chance to hide it, e.g. someone glancing at their phone next to others).
- Below that, one row per hotel account (name, that hotel's own balance) — tapping a row opens **`/wallet/:hotelId`**, a drill-down showing that hotel's `SalesRecord` history in plain language ("Order #142 charged KSh 450", "Payment received: KSh 450 — cash"), sourced directly from the same audit-trail query already spec'd in the finance plan (`SELECT * FROM sales_records WHERE orderId IN (customer's orders at this hotel) ORDER BY createdAt`). This is the "details for what belongs where" — combined number up top for a quick glance, full per-hotel statement one tap away.
- Zero-balance hotels can still appear (shows "All settled" rather than being hidden) if the customer has ordered there before — disappearing rows would be confusing ("wait, where did my account with them go").

## Notifications on every financial movement

Both `ORDER_CHARGE` and `ORDER_PAYMENT` `SalesRecord` writes emit through the same event-outbox pattern already established (same transaction as the ledger insert) — two new `EventName` values: `customer_account_credited`, `customer_account_payment_recorded`. Each fans out to two handlers, kept separate since they're genuinely different concerns:

- `sms-account-credited.handler.ts` / `sms-account-payment.handler.ts` — sends the SMS.
- `notify-account-credited.handler.ts` / `notify-account-payment.handler.ts` — writes the in-app notification (see below).

### SMS templates (as specified)

Charge:
> Dear {customer.name}, your account has been credited for your order #{order.orderNumber}, amount: KSh {record.amount}. New outstanding balance is: KSh {account.balance}. We hope you enjoy our services.

Payment:
> Dear {customer.name}, your payment has been recorded for your order #{order.orderNumber}, amount: KSh {record.amount}. New outstanding balance is: KSh {account.balance}. We hope you enjoy our services and come back next time on Ladha Deliveries on {publicLink}.

`account.balance` here is **that specific hotel's** `CustomerAccount` balance, not the wallet's combined figure — the ledger event is scoped to one hotel's account, same as everything else in the tenant model, and the SMS is reporting on the thing that just changed. One thing worth flagging since you may not have considered it: neither template names the hotel, so a customer with accounts at two hotels gets two structurally identical texts a day apart and has to infer which is which from context (or the order number, if they remember it). Worth a one-word insertion — `"...for your order #142 at {hotel.name}, amount..."` — but I've left your wording exactly as given above; say the word and I'll fold it in.

`publicLink` is the platform's marketplace URL (`PUBLIC_URL`/`MEDIA_BASE_URL`-equivalent env var, whichever one already resolves to the live storefront) — this is a platform-brand plug at the end of a hotel-scoped message, which is consistent with the earlier rebrand split: hotel-scoped SMS stays signed by the hotel, but a "come back and browse" call-to-action is naturally platform-level since it's inviting them back to the marketplace, not just that one hotel.

### In-app notification

New lightweight model — deliberately **not** a `Conversation`/`Message` (those are for two-way or broadcast communication; this is a private, no-reply transactional receipt, same distinction Diner Ledger draws by keeping its `notifications` table entirely separate from `transactions`):

```prisma
enum NotificationType {
  WALLET_CREDIT
  WALLET_PAYMENT
}

model Notification {
  id         String           @id @default(uuid()) @db.Uuid
  customerId String           @db.Uuid
  hotelId    String           @db.Uuid
  orderId    String?          @db.Uuid
  type       NotificationType
  title      String
  body       String
  read       Boolean          @default(false)
  createdAt  DateTime         @default(now())

  customer Customer @relation(fields: [customerId], references: [id])

  @@index([customerId, read])
  @@map("notifications")
}
```
- Handler writes one row with the same content as the SMS (title: "Account credited" / "Payment recorded", body: the balance-forward line), `read: false`.
- Delivered live over the existing single WS connection if the customer's app is open (a toast + badge increment) — same "DB is truth, WS is push convenience" rule from the messaging plan: if they're offline, the row is sitting there waiting, no delivery guarantee needed beyond the write itself.
- Surfaces in the wallet screen as a "Recent activity" feed at the top (unread ones highlighted, tapping marks read) — this is the natural home for it since it's inherently a wallet-scoped notice, not a chat thread; no separate global notification center needed for this scope.

## Sequencing

Build this right after the finance module's core (`SalesRecord`/`CustomerAccount` + the two-step charge/payment flow) — the wallet and notifications are both read-only consumers of that data plus a couple of event handlers, nothing here changes the finance module's write path.

