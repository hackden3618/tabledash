/**
 * Purpose: REST API endpoints for Order Management & Dashboard Metrics.
 * Responsibilities: Handles POST /api/v1/orders, GET /api/v1/orders, PATCH /api/v1/orders/:id/status, and GET /api/v1/orders/dashboard/metrics.
 * Dependencies: Elysia, shared/config.ts, shared/schemas.ts, orders service.
 * When to modify: When adding new order endpoints or modifying response formats.
 */

import { jwt } from "@elysiajs/jwt";
import { Elysia, t } from "elysia";
import { env } from "../../../../../shared/config";
import {
  CreateOrderSchema,
  IdParamSchema,
  UpdateOrderStatusSchema,
} from "../../../../../shared/schemas";
import type { OrderStatus } from "../../../../../shared/types";
import {
  getDashboardMetrics,
  getOrderById,
  getOrders,
  placeOrder,
  updateOrderStatus,
} from "./service";
import { verifyAdminToken } from "../auth/service";

export const ordersRoute = new Elysia({
  prefix: `${env.apiPrefix}/orders`,
  detail: {
    summary: "Order placement, tracking, and status update endpoints",
    tags: ["Orders"],
  },
})
  .use(
    jwt({
      name: "jwt",
      secret: env.jwtSecret,
    })
  )
  .post(
    "/",
    async ({ body, set }) => {
      try {
        const order = await placeOrder(body);
        set.status = 201;
        return { success: true, data: order };
      } catch (err: any) {
        set.status = 400;
        return { success: false, error: err.message || "Failed to place order" };
      }
    },
    {
      body: CreateOrderSchema,
    }
  )
  .get(
    "/",
    async ({ query }) => {
      const statusFilter = query.status as OrderStatus | undefined;
      const orders = await getOrders(statusFilter);
      return { success: true, data: orders };
    },
    {
      query: t.Object({
        status: t.Optional(t.String()),
      }),
    }
  )
  .get("/dashboard/metrics", async ({ headers, jwt, set }) => {
    const authHeader = headers["authorization"];
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      set.status = 401;
      return { success: false, error: "Missing or invalid authorization header" };
    }
    const token = authHeader.split(" ")[1] ?? "";
    try {
      await verifyAdminToken(token, (t) => jwt.verify(t));
    } catch {
      set.status = 401;
      return { success: false, error: "Invalid or expired session token" };
    }
    const metrics = await getDashboardMetrics();
    return { success: true, data: metrics };
  })
  .get(
    "/:id",
    async ({ params, set }) => {
      try {
        const order = await getOrderById(params.id);
        return { success: true, data: order };
      } catch (err: any) {
        set.status = 404;
        return { success: false, error: err.message };
      }
    },
    {
      params: IdParamSchema,
    }
  )
  .patch(
    "/:id/status",
    async ({ params, body, headers, jwt, set }) => {
      const authHeader = headers["authorization"];
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        set.status = 401;
        return { success: false, error: "Missing or invalid authorization header" };
      }
      const token = authHeader.split(" ")[1] ?? "";
      try {
        await verifyAdminToken(token, (t) => jwt.verify(t));
      } catch {
        set.status = 401;
        return { success: false, error: "Invalid or expired session token" };
      }
      try {
        const updated = await updateOrderStatus(params.id, body.status as OrderStatus, body.cancelReason);
        return { success: true, data: updated };
      } catch (err: any) {
        set.status = 400;
        return { success: false, error: err.message };
      }
    },
    {
      params: IdParamSchema,
      body: UpdateOrderStatusSchema,
    }
  );
