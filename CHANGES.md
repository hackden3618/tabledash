# Changes in this drop

Everything below is code-only — nothing here has been deployed. Railway env
vars (VAPID keys, PUBLIC_URL/MEDIA_BASE_URL fix) were already set directly
on the live service and are NOT part of this zip.

## Deploy steps (do these in order)
1. `bun install` — new dependency: `web-push`
2. `bunx prisma migrate dev` — adds `push_subscriptions` table and
   `hotels.is_listed` column
3. Commit, push, let Railway redeploy

## 1. Upload domain bug
`PUBLIC_URL`/`MEDIA_BASE_URL` were hardcoded to a stale `tabledash.up.railway.app`
domain from before the service was renamed to `ladha`. Fixed on Railway directly
(now reference `${{RAILWAY_PUBLIC_DOMAIN}}` so this can't drift again). No code
change. Note: images uploaded before the fix still have the dead domain baked
into their stored URL — needs a one-time DB backfill (not yet written).

## 2. Two installable PWAs (customer + kitchen)
- `apps/web/public/manifest-customer.webmanifest`, `manifest-kitchen.webmanifest`
  — distinct name/icon/theme-color/scope so they're unconfusable on a home screen
- `apps/web/public/ladha_icon_customer.png`, `ladha_icon_kitchen.png` — generated
  placeholder icons (green "L" / amber "K"); swap for real designed icons when ready
- `apps/web/src/pwa/manifestSwitcher.ts` — swaps the linked manifest based on route
- `apps/web/src/components/InstallBanner.tsx` — non-intrusive top banner, dismiss
  is session-only (not persisted) so it reappears on reload; iOS Safari fallback tip
- Wired into both `CustomerShell` and `KitchenShell` in `router.tsx`

## 3. Web Push notifications
- `prisma/schema.prisma` — new `PushSubscription` model
- `apps/api/src/modules/push/` — service (VAPID send/prune) + routes (subscribe/
  unsubscribe/vapid-public-key)
- Hooked into `order-created.handler.ts` (kitchen alert) and
  `order-status-updated.handler.ts` (customer alert + cancellation alert to kitchen)
- `apps/web/public/sw.js` — receives push, shows notification, routes the click
- `apps/web/src/pwa/push.ts` — subscribe flow; kitchen re-subscribes every admin
  session (not just once) since a missed order alert is costly
- `shared/config.ts` — `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY`/`VAPID_SUBJECT`,
  required in production

## 4. QR code direct hotel links
- `/h/:hotelSlug` route → drops customer straight into that hotel's menu,
  skipping the zone/location picker
- Open question flagged, not yet decided: a hotel hidden from the marketplace
  (see #5) is currently also unreachable via this link, since both use the same
  listing query. Say the word if you want hidden-but-QR-reachable instead.

## 5. Platform admin: hide/delete hotels
- `hotels.is_listed` column (default true); discovery/marketplace queries now
  filter on it
- `PATCH /platform/hotels/:id/listing` — show/hide toggle
- `DELETE /platform/hotels/:id` — soft delete (sets deletedAt, closes, unlists);
  order/ledger/review history is preserved, nothing is hard-deleted
- Both wired into the hotel detail view in `PlatformAdminPage.tsx`

## 6. Platform console scroll bug
`<main>` used `minHeight: "100vh"` inside a flex row with no explicit scroll
container. Changed to `height: 100dvh` + `overflow-y: auto`, matching the
`.app-container`/`.admin-container` pattern already used elsewhere.

## 7. Admin login "go home" link
Pointed at `/` (customer marketplace) — now points at `/kitchen`, relabeled
"Kitchen Home" instead of "Marketplace".

## 8. Missing username in admin welcome SMS
`adminUsername` was already in the event payload but never reached the SMS
template — an admin got a link to set a password with no username to log in
with. Fixed in both `hotelWelcome` (new hotel's first admin) and `staffWelcome`
(additional admins added to an existing hotel).
