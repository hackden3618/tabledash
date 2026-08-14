# Changes in this drop

Verified before packaging: tsc -b and vite build both run clean on the
frontend, zero errors. Backend tsc shows 226 errors, but confirmed
environmental (identical "Cannot find module generated/prisma/client"
cascade in files never touched this session, e.g. finance/service.ts) -
run `bunx prisma generate` locally and it clears. Schema brace/paren
balance and migration SQL syntax both checked directly.

## 1. Critical: /kitchen outage (this was the same-day emergency fix,
   already deployed and confirmed live before this batch)
Bun's SPA catch-all route tried to stream a directory as a response body
for the bare /kitchen URL, because public/kitchen/sw.js (intentional -
gives the kitchen PWA its own /kitchen/ service-worker scope) makes
dist/kitchen a real directory. Route now checks isFile() before serving,
falls through to index.html otherwise. Verified against real build output.

## 2. Region/zone hierarchy - County -> Town -> Zone
- Confirmed and documented the existing (confusingly-named) model mapping:
  MegaRegion=County, Zone=Town, TownRegion=finest zone.
- Added full TownRegion CRUD (GET/POST/PATCH /platform/town-regions) -
  previously had zero backend endpoints at all.
- Creating a Town now auto-creates its "General Area" TownRegion
  transactionally - the guaranteed fallback exists by construction, not
  by an admin remembering an extra step.
- Discovery API now exposes each town's zones (deliveryRegions) to the
  guest-facing app.
- Guest picker rewritten as a proper 3-step wizard (County -> Town ->
  Zone) in MenuListPage.tsx, replacing the old flat single-list picker.
  Resumes at the right step on reopen; back navigation between steps;
  "General Area" flagged with a hint for guests unsure of their exact area.
- Customer.townRegionId added (migration included) - a logged-in
  customer's precise selected zone now persists to their account, not
  just localStorage. Not PIN-gated (routine data, not identity-sensitive).
  Returning customers' saved location takes over from local device state
  on login.

## 3. Hotel-onboarding bugs
- New hotels no longer auto-enroll the creating admin's phone into the
  SMS order-alert list (receiveSms now defaults false on the StaffUser
  row created at hotel-creation time). Hotels opt a real staff phone in
  deliberately from their own settings.
- "Order via WhatsApp" now resolves the actual first HOTEL_ADMIN of the
  specific hotel in the cart via a new public endpoint
  (GET /hotels/:hotelId/whatsapp-contact), instead of a hardcoded number
  that was silently routing every customer, on every hotel, to one fixed
  phone. Hides the button gracefully if a hotel genuinely has no contact
  on file, instead of messaging the wrong person.

## 4. Hidden hotels leaking into Popular/Trending
discovery/service.ts's product query (feeding Popular Meals, Trending,
Recently Ordered) had no hotel.isListed/deletedAt filter at all, unlike
the restaurant list query right next to it. A hidden hotel's items kept
surfacing in these sections even though the hotel itself was correctly
invisible elsewhere. Fixed; confirmed search and the direct hotel-slug
QR-link path were already correctly scoped (search inherits it
transitively via getAllHotels(); the direct-link path is intentionally
unaffected, per the earlier open design decision on that).

## Deploy steps
1. bun install (root) - no new dependencies this batch, but keeps lockfile honest
2. bunx prisma generate
3. bunx prisma migrate deploy - applies 20260813190000_add_customer_town_region
4. Commit, push, deploy as normal

## Still open / not built this batch
- Platform admin UI for managing TownRegion entries beyond the
  auto-created "General Area" (e.g. adding "Karagita", "CBD" within
  Naivasha) - backend CRUD exists, no admin UI screen yet.
- Whether a hidden hotel's direct QR link should still work is still an
  open product decision, not yet made either way beyond "currently it does."
