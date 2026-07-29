/**
 * Purpose: REST API endpoints for Order Management & Dashboard Metrics.
 * Responsibilities: Handles POST /api/v1/orders, GET /api/v1/orders, PATCH /api/v1/orders/:id/status, GET /api/v1/orders/dashboard/metrics,
 *                   PATCH /api/v1/orders/:id/payment, GET /api/v1/orders/daily.
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
  UpdateOrderPaymentSchema,
  CancelOrderSchema,
} from "../../../../../shared/schemas";
import type { OrderStatus, PaymentStatus } from "../../../../../shared/types";
import {
  cancelOrderByCustomer,
  getDashboardMetrics,
  getDailyOrders,
  getOrderById,
  getOrders,
  placeOrder,
  updateOrderStatus,
  updateOrderPayment,
} from "./service";
import { verifyAdminToken } from "../auth/service";
import { verifyCustomerToken } from "../customers/auth.service";

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
    async ({ body, set, headers }) => {
      try {
        const guestId = headers["x-guest-id"];
        const order = await placeOrder({ ...body, guestId });
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
    async ({ query, set, headers, jwt }) => {
      const authHeader = headers["authorization"];
      let adminHotelId: string | undefined;
      if (authHeader?.startsWith("Bearer ")) {
        const token = authHeader.split(" ")[1] ?? "";
        try {
          const admin = await verifyAdminToken(token, (t) => jwt.verify(t));
          adminHotelId = admin.hotelId ?? undefined;
        } catch {}
      }
      try {
        const statusFilter = query.status as OrderStatus | undefined;
        const orders = await getOrders(statusFilter, adminHotelId);
        return { success: true, data: orders };
      } catch (err: any) {
        set.status = 500;
        return { success: false, error: "Failed to load orders" };
      }
    },
    {
      query: t.Object({
        status: t.Optional(t.String()),
        date: t.Optional(t.String()),
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
    let admin;
    try {
      admin = await verifyAdminToken(token, (t) => jwt.verify(t));
    } catch {
      set.status = 401;
      return { success: false, error: "Invalid or expired session token" };
    }
    const metrics = await getDashboardMetrics(admin.hotelId ?? undefined);
    return { success: true, data: metrics };
  })
  .get("/daily", async ({ query, headers, jwt, set }) => {
    const authHeader = headers["authorization"];
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      set.status = 401;
      return { success: false, error: "Missing or invalid authorization header" };
    }
    const token = authHeader.split(" ")[1] ?? "";
    let admin;
    try {
      admin = await verifyAdminToken(token, (t) => jwt.verify(t));
    } catch {
      set.status = 401;
      return { success: false, error: "Invalid or expired session token" };
    }
    const date = (query.date ?? new Date().toISOString().split("T")[0]) as string;
    const orders = await getDailyOrders(date, admin.hotelId ?? undefined);
    return { success: true, data: orders };
  }, {
    query: t.Object({
      date: t.Optional(t.String()),
    }),
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
      let admin;
      try {
        admin = await verifyAdminToken(token, (t) => jwt.verify(t));
      } catch {
        set.status = 401;
        return { success: false, error: "Invalid or expired session token" };
      }
      try {
        const updated = await updateOrderStatus(params.id, body.status as OrderStatus, body.cancelReason, admin.hotelId ?? undefined);
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
  )
  .patch(
    "/:id/payment",
    async ({ params, body, headers, jwt, set }) => {
      const authHeader = headers["authorization"];
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        set.status = 401;
        return { success: false, error: "Missing or invalid authorization header" };
      }
      const token = authHeader.split(" ")[1] ?? "";
      let admin;
      try {
        admin = await verifyAdminToken(token, (t) => jwt.verify(t));
      } catch {
        set.status = 401;
        return { success: false, error: "Invalid or expired session token" };
      }
      try {
        const updated = await updateOrderPayment(params.id, {
          paymentStatus: body.paymentStatus as PaymentStatus | undefined,
          amountPaid: body.amountPaid,
        }, admin.hotelId ?? undefined);
        return { success: true, data: updated };
      } catch (err: any) {
        set.status = 400;
        return { success: false, error: err.message };
      }
    },
    {
      params: IdParamSchema,
      body: UpdateOrderPaymentSchema,
    }
  )
  // ─── Customer: Cancel own order ────────────────────────────────────────────
  .post(
    "/:id/cancel",
    async ({ params, body, headers, jwt, set }) => {
      const auth = headers["authorization"] ?? "";
      const token = auth.replace("Bearer ", "").trim();
      const customerId = await verifyCustomerToken(token, (t) => jwt.verify(t));
      if (!customerId) {
        set.status = 401;
        return { success: false, error: "Invalid or missing customer token" };
      }
      try {
        const updated = await cancelOrderByCustomer(params.id, customerId, body.reason);
        return { success: true, data: updated };
      } catch (err: any) {
        set.status = 400;
        return { success: false, error: err.message };
      }
    },
    {
      params: IdParamSchema,
      body: CancelOrderSchema,
      headers: t.Object({ authorization: t.Optional(t.String()) }),
    }
  );
