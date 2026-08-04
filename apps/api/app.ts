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
import { financeRoute } from "./src/modules/finance/route";
import { discoveryRoute } from "./src/modules/discovery/route";
import { messagingRoute } from "./src/modules/messaging/routes";
import { resolveMessagingActorFromWebSocketTicket } from "./src/modules/messaging/controller";
import { assertConversationAccess, getConversationIdentityKeys, getInbox } from "./src/modules/messaging/service";
import { wsHub } from "./src/modules/websocket/hub";
import { env } from "../../shared/config";
import { logger } from "./src/lib/logger";
import { prisma } from "../../infrastructure/database/prisma";

export const app = new Elysia()

  .onRequest(({ request, set }) => {
    const requestId = request.headers.get("x-request-id") || crypto.randomUUID();
    set.headers["x-request-id"] = requestId;
  })

  .onError(({ request, set, error }) => {
    const requestId = set.headers["x-request-id"];
    logger.error("Unhandled API error", {
      requestId,
      method: request.method,
      path: new URL(request.url).pathname,
      error: error instanceof Error ? error.message : String(error),
    });
  })

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
  .get("/api/v1/ready", async ({ set }) => {
    try {
      const [databaseCheck] = await prisma.$queryRaw<{ sequence_exists: boolean }[]>`
        SELECT to_regclass('public.customer_account_id_seq') IS NOT NULL AS sequence_exists
      `;
      if (!databaseCheck?.sequence_exists) throw new Error("customer account sequence is missing");
      return { status: "ready", timestamp: new Date().toISOString() };
    } catch {
      set.status = 503;
      return { status: "not_ready", timestamp: new Date().toISOString() };
    }
  })

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
      ticket: t.Optional(t.String()),
      guestId: t.Optional(t.String()),
      conversationId: t.Optional(t.String()),
    }),
    async open(ws) {
      let role: "admin" | "customer" = "customer";
      const orderId = ws.data.query.orderId;

      let hotelId: string | undefined;
      let identityKey: string | undefined;
      const conversationIds = new Set<string>();
      let authenticatedActor: Awaited<ReturnType<typeof resolveMessagingActorFromWebSocketTicket>>;
      try {
        if (!ws.data.query.ticket) throw new Error("Missing WebSocket ticket");
        const ticket = await ws.data.jwt.verify(ws.data.query.ticket);
        if (!ticket || typeof ticket !== "object") throw new Error("Invalid WebSocket ticket");
        const actor = await resolveMessagingActorFromWebSocketTicket(ticket);
        authenticatedActor = actor;
        identityKey = actor.kind === "CUSTOMER" ? `customer:${actor.customerId}` : actor.kind === "GUEST" ? `guest:${actor.guestIdentityId}` : actor.kind === "HOTEL_STAFF" ? `admin:${actor.adminUserId}` : `platform:${actor.platformAdminId}`;
        if (actor.kind === "HOTEL_STAFF") {
          role = "admin";
          hotelId = actor.hotelId;
        } else if (actor.kind === "PLATFORM_ADMIN") {
          role = "admin";
        }
        // The application intentionally uses one root socket. Authorize all
        // conversations visible to this identity once, so typing events can
        // still use conversation-level routing without a page socket.
        const accessible = await getInbox(actor);
        const allConversations = [...accessible.orderConversations, ...accessible.hotelNotices, ...accessible.platformNotices, ...accessible.talkToStaff, ...accessible.communityChannels];
        allConversations.forEach((conversation) => conversationIds.add(conversation.id));
      } catch {
        ws.close(1008, "Realtime authorization required");
        return;
      }

      if (ws.data.query.conversationId) {
        try {
          await assertConversationAccess(authenticatedActor, ws.data.query.conversationId);
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
        const event = JSON.parse(String(message)) as { type?: string; conversationId?: string; lastSeq?: number };
        if (event.type === "PING") return;
        if (event.type === "RESYNC") {
          const missed = wsHub.getEventsSince(event.lastSeq ?? 0);
          for (const payload of missed) {
            ws.send(payload);
          }
          return;
        }
        if (event.type === "JOIN_CONVERSATION") {
          if (!event.conversationId) return;
          const senderIdentity = wsHub.getIdentityKey(ws.id);
          const recipients = await getConversationIdentityKeys(event.conversationId);
          if (senderIdentity && recipients.includes(senderIdentity)) wsHub.joinConversation(ws.id, event.conversationId);
          return;
        }
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
  .use(discoveryRoute)
  .use(menuRoute)
  .use(ordersRoute)
  .use(customersRoute)
  .use(settingsRoute)
  .use(uploadRoute)
  .use(platformRoute)
  .use(messagingRoute)
  .use(financeRoute)

  // Serve the built frontend SPA for any non-API route
  .get("/*", ({ params }) => {
    const dist = join(import.meta.dir, "..", "web", "dist");
    const wild = params["*"] as string;
    const filePath = !wild ? "/index.html" : `/${wild}`;
    const file = Bun.file(join(dist, filePath));
    if (file.size > 0) return file;
    return Bun.file(join(dist, "index.html"));
  });
