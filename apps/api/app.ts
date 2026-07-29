/**
 * Purpose: Main Elysia Application instance assembly for tableDash.
 * Responsibilities: Registers middleware (CORS, OpenAPI/Swagger), configures WebSockets `/ws`, and registers feature domain routes (auth, menu, orders, customers).
 * Dependencies: Elysia, @elysia/openapi, @elysia/cors, feature module routes, wsHub.
 * When to modify: When adding new domain modules, global middleware, or modifying WebSocket subscription channels.
 */

import { cors } from "@elysiajs/cors";
import { jwt } from "@elysiajs/jwt";
import { openapi } from "@elysia/openapi";
import { Elysia, t } from "elysia";
import { join } from "node:path";

// Feature module routes & WS hub
import { authRoute } from "./src/modules/auth/route";
import { customersRoute } from "./src/modules/customers/route";
import { hotelsRoute } from "./src/modules/hotels/route";
import { menuRoute } from "./src/modules/menu/route";
import { ordersRoute } from "./src/modules/orders/route";
import { platformRoute } from "./src/modules/platform/routes";
import { settingsRoute } from "./src/modules/settings/route";
import { uploadRoute } from "./src/modules/upload/route";
import { messagingRoute } from "./src/modules/messaging/routes";
import { resolveMessagingActor } from "./src/modules/messaging/controller";
import { assertConversationAccess, getConversationIdentityKeys, listConversations } from "./src/modules/messaging/service";
import { wsHub } from "./src/modules/websocket/hub";
import { env } from "../../shared/config";

export const app = new Elysia()

  // Security headers (applied after every request)
  .onAfterHandle(({ set }) => {
    set.headers["x-content-type-options"] ??= "nosniff";
    set.headers["x-frame-options"] ??= "DENY";
    set.headers["x-xss-protection"] ??= "1; mode=block";
    set.headers["referrer-policy"] ??= "strict-origin-when-cross-origin";
    set.headers["permissions-policy"] ??= "camera=(), microphone=(), geolocation=()";
    set.headers["strict-transport-security"] ??= "max-age=31536000; includeSubDomains";
  })

  // Global CORS enabling frontend web app to communicate with API
  .use(cors({ origin: env.corsOrigin }))

  // The shared JWT plugin is also required by the WebSocket handshake so an
  // admin socket can be tenant-scoped from its signed token.
  .use(jwt({ name: "jwt", secret: env.jwtSecret }))

  // Platform health check endpoint
  .get("/api/v1/health", () => ({ status: "ok", timestamp: new Date().toISOString() }))

  // Swagger OpenAPI documentation
  .use(
    openapi({
      documentation: {
        info: {
          title: "Ladha Deliveries API",
          version: "1.1.0",
          description: "Online Ordering and Delivery System API for Local Hotels & Market Vendors",
        },
        tags: [
          { name: "Auth", description: "Admin authentication endpoints" },
          { name: "Menu", description: "Menu product catalog endpoints" },
          { name: "Orders", description: "Order placement, lifecycle, and analytics" },
          { name: "Customers", description: "Customer records and order histories" },
          { name: "Settings", description: "Application settings management" },
        ],
      },
    })
  )

  // WebSocket connection endpoint for real-time notifications
  .ws("/ws", {
    query: t.Object({
      role: t.Optional(t.String({ default: "customer" })),
      orderId: t.Optional(t.String()),
      token: t.Optional(t.String()),
      guestId: t.Optional(t.String()),
      conversationId: t.Optional(t.String()),
    }),
    async open(ws) {
      const role = (ws.data.query.role === "admin" ? "admin" : "customer") as "admin" | "customer";
      const orderId = ws.data.query.orderId;

      let hotelId: string | undefined;
      let identityKey: string | undefined;
      const conversationIds = new Set<string>();
      if (role === "admin" && ws.data.query.token) {
        try {
          const payload = await ws.data.jwt.verify(ws.data.query.token);
          if (payload && typeof payload === "object" && (payload as any).hotelId) {
            hotelId = (payload as any).hotelId;
          }
        } catch {
          console.warn(`[WS] Admin ${ws.id} connected with invalid token — no hotel scoping`);
        }
      }

      try {
        const actor = await resolveMessagingActor(
          { authorization: ws.data.query.token ? `Bearer ${ws.data.query.token}` : undefined, "x-guest-id": ws.data.query.guestId },
          (token) => ws.data.jwt.verify(token)
        );
        identityKey = actor.kind === "CUSTOMER" ? `customer:${actor.customerId}` : actor.kind === "GUEST" ? `guest:${actor.guestIdentityId}` : actor.kind === "HOTEL_STAFF" ? `admin:${actor.adminUserId}` : `platform:${actor.platformAdminId}`;
        if (!hotelId && actor.kind === "HOTEL_STAFF") hotelId = actor.hotelId;
        // The application intentionally uses one root socket. Authorize all
        // conversations visible to this identity once, so typing events can
        // still use conversation-level routing without a page socket.
        const accessible = await listConversations(actor);
        accessible.forEach((conversation) => conversationIds.add(conversation.id));
      } catch {}

      if (ws.data.query.conversationId) {
        try {
          const actor = await resolveMessagingActor(
            {
              authorization: ws.data.query.token ? `Bearer ${ws.data.query.token}` : undefined,
              "x-guest-id": ws.data.query.guestId,
            },
            (token) => ws.data.jwt.verify(token)
          );
          await assertConversationAccess(actor, ws.data.query.conversationId);
          conversationIds.add(ws.data.query.conversationId);
        } catch {
          console.warn(`[WS] Rejected unauthorized conversation subscription for ${ws.id}`);
        }
      }

      wsHub.registerClient({
        id: ws.id,
        role,
        hotelId,
        orderId,
        conversationIds,
        identityKey,
        send: (data: string) => ws.send(data),
      });
    },
    close(ws) {
      wsHub.unregisterClient(ws.id);
    },
    async message(ws, message) {
      wsHub.touch(ws.id);
      try {
        const event = JSON.parse(String(message)) as { type?: string; conversationId?: string };
        if (event.type === "TYPING_START" || event.type === "TYPING_STOP") {
          if (!event.conversationId) return;
          const senderIdentity = wsHub.getIdentityKey(ws.id);
          const recipients = await getConversationIdentityKeys(event.conversationId);
          // Authorization is evaluated against current participants, not the
          // handshake snapshot, so newly created conversations work instantly.
          if (!senderIdentity || !recipients.includes(senderIdentity)) return;
          wsHub.broadcastToIdentitiesExcept(recipients, senderIdentity, { type: "TYPING", payload: { conversationId: event.conversationId, identityKey: senderIdentity, typing: event.type === "TYPING_START" } });
        }
      } catch {}
    },
  })

  // Feature domain routes
  .use(authRoute)
  .use(hotelsRoute)
  .use(menuRoute)
  .use(ordersRoute)
  .use(customersRoute)
  .use(settingsRoute)
  .use(uploadRoute)
  .use(platformRoute)
  .use(messagingRoute)

  // Serve the built frontend SPA for any non-API route
  .get("/*", ({ params }) => {
    const dist = join(import.meta.dir, "..", "web", "dist");
    const wild = params["*"] as string;
    const filePath = !wild ? "/index.html" : `/${wild}`;
    const file = Bun.file(join(dist, filePath));
    if (file.size > 0) return file;
    return Bun.file(join(dist, "index.html"));
  });
