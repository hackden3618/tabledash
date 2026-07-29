# Production Readiness Handoff

## Current strengths

- The API is organized by business capability rather than transport concerns.
- Orders, payment updates, hotel lifecycle events, and staff onboarding use transactional outbox records.
- Hotel and platform administrator identities are separate, with hotel roles represented explicitly.
- Customer and staff WebSocket delivery is centralized in one hub and the web app opens one root connection.
- Product and order history are soft-delete/freshness aware, preserving operational history.
- Media storage has an abstraction for local development and S3-compatible production providers.
- Request schemas, password hashing, rate limiting, security headers, and customer-owned order checks are already present.

## Hardening completed in this pass

- Duplicate cart lines are aggregated before validation, pricing, order creation, and stock reservation.
- Stock reservation is now an atomic conditional decrement, preventing overselling under concurrent checkouts.
- Cancellation transitions claim the order atomically before restoring stock, preventing double restoration.
- Staff-scoped order and product reads/writes reject nullable or mismatched tenant ownership.
- Payment changes and their notification event now commit in one transaction.
- Legacy staff-phone fallback remains available only for the original default hotel; it cannot leak alerts across tenants.
- Menu and hotel status broadcasts scope hotel staff while retaining customer and platform visibility.
- WebSocket heartbeats prevent the hub from expiring healthy idle browser sessions.
- SMS credentials fail closed, and logs no longer print message bodies, gateway responses, or reset OTPs.
- Password-reset OTPs are no longer written into the event outbox.
- Staff authentication tokens now carry an explicit `hotel_staff` type while accepting older untyped sessions during rollout.
- WebSocket authentication now uses a short-lived server-signed handshake ticket instead of putting bearer tokens in URLs.
- Cart quantities accept direct numeric entry and revalidate product stock and hotel availability before checkout.
- Production startup fails closed for weak JWT secrets, wildcard CORS, default seed credentials, local media storage, and missing SMS credentials.

## Release gates still required

1. Run migrations against a production database clone and verify every nullable `hotelId` row is backfilled before tightening constraints. Do not make those columns required in production without this check.
2. Add integration coverage for concurrent checkout, concurrent cancellation, payment/refund rules, outbox retry/dead-letter behavior, and cross-hotel authorization.
3. Replace process-local rate limiting and OTP state with shared production storage before horizontal scaling.
4. Configure an external object-storage provider and exercise upload, deletion, orphan cleanup, and CDN URL behavior on Railway.
5. Run browser-level mobile/accessibility checks for keyboard focus, contrast, reduced motion, offline recovery, and back-navigation state.
6. Add observability before launch: structured request IDs, error reporting, outbox metrics, database latency, WebSocket connection counts, and alerting for failed notifications.

This document is a release handoff, not a claim that the application is already production-ready. The remaining gates involve production data, deployment configuration, or test infrastructure and should be completed before declaring the first release safe.
