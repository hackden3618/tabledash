# Ladha Deliveries

Taste the moment.

Ladha is a food ordering and delivery platform built for market stalls, small hotels and local kitchens, starting with markets around Naivasha and expanding from there. It began as a single hotel ordering app and grew into a full multi tenant marketplace with its own finance ledger, staff tools and a platform admin panel to onboard new vendors.

I built this alone, mostly at night, testing it on real orders with real people before ever writing a line about it. It is still moving fast and some parts are rougher than others. This README is meant to actually help anyone (including future me) get around the codebase, not just look nice.

## What it actually does

- Customers browse a marketplace of hotels near them, order food and pay cash or M-Pesa on delivery, no account required to get started
- Guests get a persistent identity through the browser so their order history and wallet still work without ever creating a password
- Orders are dispatched to the right hotel by SMS the moment they are placed, even if the kitchen has no internet at that exact second, because the message goes through a retry queue instead of a single fire and forget call
- Every order has its own financial ledger entry. Nothing about a customer's balance is guessed or derived from vibes, it is always traceable back to a specific charge, payment, refund or adjustment
- Cancelled orders correctly restore stock and never get counted as revenue
- Hotels track utensils sent out with deliveries separately from payment collection, since in real life those two things do not always happen on the same trip
- Staff and hotel admins run their day from a kitchen panel, platform admins manage the whole network of hotels from their own separate panel
- In app messaging between customers and hotel staff, plus hotel and platform wide announcements

## Stack

- **Backend:** Bun + Elysia, Prisma on PostgreSQL
- **Frontend:** React + Vite, plain CSS with Tailwind utility classes, no component library beyond what I wrote myself
- **Realtime:** one persistent authenticated WebSocket connection per session, ticket based auth so tokens never sit in a URL
- **SMS:** TextSMS (Kenyan gateway), routed through a transactional outbox so a dropped message gets retried instead of vanishing
- **Deploy:** Railway

## Architecture, briefly

Three separate front doors into the same backend:

- `/` the customer marketplace
- `/kitchen` hotel staff and hotel admins
- `/platform` platform admins who onboard new hotels and manage the whole system

Every hotel scoped table carries a `hotelId`, and every query for hotel scoped data is filtered by the hotel on the authenticated staff member's own token, never by anything the client sends. That boundary is meant to be absolute. If you ever find a query that trusts a client supplied hotelId for something sensitive, that is a bug, please open an issue.

Money moves through one path only. `SalesRecord` is the ledger, `CustomerAccount` is a running balance kept in sync with it, and `Order.paymentStatus` is just a cached read of what the ledger says, never something written to directly. If you are adding a feature that touches payment, refunds or balances, go through the finance module, do not add a new place that edits an order's payment fields.

## Running it locally

You need Bun and a Postgres database.

```bash
bun install
cp .env.example .env
# fill in DATABASE_URL, JWT_SECRET, and whatever SMS/media keys you have,
# it will run fine in dev without real SMS or S3 credentials
bunx prisma migrate deploy
bun run server     # backend, apps/api
bun run web         # frontend, apps/web
```

Seeding creates a default hotel and platform admin from the `SEED_ADMIN_*` env vars. Change those before anything touches production, the app will refuse to boot with the defaults if `NODE_ENV=production`.

## Project layout

```
apps/api/src/modules/     one folder per business domain: orders, finance, hotels,
                           messaging, notifications, platform, customers, websocket
apps/web/src/pages/       customer/, admin/ (kitchen), platform/
prisma/schema.prisma      the whole data model
prisma/migrations/        hand reviewed migrations, additive first where possible
```

Each module tries to own its own thing. Orders own the order lifecycle. Finance owns money. Nothing else should be quietly duplicating either.

## Known rough edges right now

- No real time payments yet, M-Pesa STK push and payouts to hotels are designed but intentionally not wired up
- Grocery and pharmacy verticals are not built, there is a small seam in the schema for them later but nothing beyond that
- The admin side does not yet show a visual progress stepper for orders the way the customer tracking page does
- Cart lives in local storage right now, not tied to a customer account across devices yet

None of this is hidden on purpose, I would rather the list be honest than the README pretend everything is finished.

## Contributing

This is a solo project for now but I am open to it not staying that way. If you want to poke around, start by reading `apps/api/src/modules/finance/service.ts` and `apps/api/src/modules/orders/service.ts`, most of what matters in this app touches one of those two files eventually.

Issues and PRs welcome, just explain the why along with the what.

## License

Not decided yet, treat it as all rights reserved until this section says otherwise.

---

Built by [@hackden3618](https://github.com/hackden3618), running under AstraTech.
