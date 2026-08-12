# Changes in this drop

Verified before packaging: `tsc -b` and `vite build` both run clean on the
frontend with zero errors. The backend can't be fully typechecked in this
sandbox (Prisma's client generator needs a binary download my network
policy blocks), but the ~216 errors that show under `tsc --noEmit` are
100% environmental — the same "Cannot find module generated/prisma/client"
cascade appears identically in files I never touched (e.g. finance/service.ts).
Run `bunx prisma generate` once locally and that noise disappears; it's not
something to chase down.

## 1. Two "semantic bugs" — hotel context
- **Account ledger SMS** (credited/payment/refund/adjustment) now say
  `[Hotel Name] ...` and "Current balance **at {hotel}**" instead of a bare
  number with no indication of which hotel's tab it belongs to.
  `apps/api/src/modules/notifications/templates.ts` +
  `handlers/account-ledger.handler.ts`.
- **Orders are now hotel-aware end to end**: `getCustomerProfile`,
  `getOrderById`, `getOrderForCustomer` all now include the hotel relation.
  `MyOrdersPage` shows the hotel name on every order card; `OrderTrackingPage`
  shows it in the header subtitle.

## 2. Real branding — replaces the earlier placeholder icons
- `ladha_icon_customer.png` / `ladha_icon_kitchen.png` — extracted and
  composited from your actual brand board (not generated placeholders),
  512x512, rounded-square, dark green (#0B1E13) / terracotta (#9A3412).
- `favicon-16.png` / `favicon-32.png` / `apple-touch-icon.png` generated
  from the same source.
- Manifests updated to reference the real icons and the correct
  brand-sampled background_color.

## 3. Boot splash — matches the frame-by-frame spec you gave
- Inlined critical CSS + markup in `index.html` so it paints before any JS
  loads — no blank white screen.
- Frame 1 (0ms): icon fades up. Frame 2 (500ms): wordmark + tagline. A
  synchronous inline script themes the whole thing (color, icon, wordmark,
  tagline, loading text) for /kitchen routes before React even starts.
- `main.tsx` hands off once mounted: first-time-today visitors get the full
  "Preparing your menu..." beat (~1.1s) with a three-dot pulse (not a
  spinner); returning visitors within 24h get a ~150ms fast dismiss.
- Theme colors unified across index.html, manifestSwitcher.ts, and
  InstallBanner.tsx — all now match the actual brand green sampled from
  the icon, instead of three slightly different green guesses.

## 4. Everything from earlier in this session (unchanged, carried forward)
Push notifications (VAPID, subscribe routes, hooked into order-created/
order-status-updated), installable PWAs with per-route manifests, platform
admin hide/delete-hotel, QR direct hotel links (/:hotelSlug), the upload
MIME-gate fix, admin login "go home" -> /kitchen, and the missing username
in the admin welcome SMS.

## Deploy steps
1. bun install (root) - picks up web-push if not already present
2. bunx prisma generate - regenerates the Prisma client
3. bunx prisma migrate status - should show clean, matching the single
   20260812094418_added_listable_toggles migration already in this zip
4. Commit, push, deploy as normal
