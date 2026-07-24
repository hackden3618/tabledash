/**
 * Purpose: Main Elysia Application instance assembly for tableDash.
 * Responsibilities: Registers middleware (CORS, OpenAPI/Swagger), configures WebSockets `/ws`, and registers feature domain routes (auth, menu, orders, customers).
 * Dependencies: Elysia, @elysia/openapi, @elysia/cors, feature module routes, wsHub.
 * When to modify: When adding new domain modules, global middleware, or modifying WebSocket subscription channels.
 */

import { cors } from "@elysiajs/cors";
import { openapi } from "@elysia/openapi";
import { Elysia, t } from "elysia";
import { join } from "node:path";

// Feature module routes & WS hub
import { authRoute } from "./src/modules/auth/route";
import { customersRoute } from "./src/modules/customers/route";
import { menuRoute } from "./src/modules/menu/route";
import { ordersRoute } from "./src/modules/orders/route";
import { platformRoute } from "./src/modules/platform/routes";
import { settingsRoute } from "./src/modules/settings/route";
import { uploadRoute } from "./src/modules/upload/route";
import { wsHub } from "./src/modules/websocket/hub";
import { env } from "../../shared/config";

export const app = new Elysia()

  // Global CORS enabling frontend web app to communicate with API
  .use(cors({ origin: env.corsOrigin }))

  // Platform health check endpoint
  .get("/api/v1/health", () => ({ status: "ok", timestamp: new Date().toISOString() }))

  // Swagger OpenAPI documentation
  .use(
    openapi({
      documentation: {
        info: {
          title: "tableDash API",
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
    }),
    open(ws) {
      const role = (ws.data.query.role === "admin" ? "admin" : "customer") as "admin" | "customer";
      const orderId = ws.data.query.orderId;

      wsHub.registerClient({
        id: ws.id,
        role: role,
        orderId: orderId,
        send: (data: string) => ws.send(data),
      });
    },
    close(ws) {
      wsHub.unregisterClient(ws.id);
    },
    message(ws, message) {
      // Handle client incoming ping/pong or channel subscriptions if necessary
      console.log(`[WS Message from ${ws.id}]:`, message);
    },
  })

  // Feature domain routes
  .use(authRoute)
  .use(menuRoute)
  .use(ordersRoute)
  .use(customersRoute)
  .use(settingsRoute)
  .use(uploadRoute)
  .use(platformRoute)

  // Serve the built frontend SPA for any non-API route
  .get("/*", ({ params }) => {
    const dist = join(import.meta.dir, "..", "web", "dist");
    const wild = params["*"] as string;
    const filePath = !wild ? "/index.html" : `/${wild}`;
    const file = Bun.file(join(dist, filePath));
    if (file.size > 0) return file;
    return Bun.file(join(dist, "index.html"));
  });
