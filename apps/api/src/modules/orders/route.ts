/**
 * Purpose: REST API endpoints for Order Management & Dashboard Metrics.
 * Responsibilities: Handles POST /api/v1/orders, GET /api/v1/orders, PATCH /api/v1/orders/:id/status, GET /api/v1/orders/dashboard/metrics,
 *                   GET /api/v1/orders/daily.
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
  CancelOrderSchema,
} from "../../../../../shared/schemas";
import type { OrderStatus } from "../../../../../shared/types";
import {
  cancelOrderByCustomer,
  getDashboardMetrics,
  getDailyOrders,
  getOrderForCustomer,
  getOrderById,
  getOrders,
  getPendingCollection,
  getPendingOrdersCount,
  getDeliveryFeeQuote,
  getRefundsOwed,
  markUtensilsIssued,
  markUtensilsReturned,
  placeOrder,
  updateOrderStatus,
} from "./service";
import { verifyAdminToken } from "../auth/service";
import { verifyCustomerToken } from "../customers/auth.service";
import { ensureGuestIdentity, isGuestId } from "../customers/guest-identity";

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
  .get("/delivery-fees", async ({ query, set }) => {
    try {
      const hotelIds = query.hotelIds.split(",").filter(Boolean);
      return { success: true, data: await getDeliveryFeeQuote(hotelIds, query.zoneId) };
    } catch (err: any) {
      set.status = 400;
      return { success: false, error: err.message || "Unable to calculate delivery fees" };
    }
  }, { query: t.Object({ hotelIds: t.String({ minLength: 1 }), zoneId: t.Optional(t.String({ format: "uuid" })) }) })
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
      if (!authHeader?.startsWith("Bearer ")) {
        set.status = 401;
        return { success: false, error: "Hotel staff authentication is required" };
      }
      try {
        const admin = await verifyAdminToken(authHeader.split(" ")[1] ?? "", (t) => jwt.verify(t));
        if (!admin.hotelId) throw new Error("This account is not assigned to a hotel");
        const statusFilter = query.status as OrderStatus | undefined;
        const orders = await getOrders(statusFilter, admin.hotelId);
        return { success: true, data: orders };
      } catch (err: any) {
        set.status = 403;
        return { success: false, error: err.message || "Unable to load orders" };
      }
    },
    {
      query: t.Object({
        status: t.Optional(t.String()),
        date: t.Optional(t.String()),
      }),
    }
  )
  .get("/dashboard/metrics", async ({ headers, jwt, set, query }) => {
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
    if (!admin.hotelId) {
      set.status = 403;
      return { success: false, error: "This account is not assigned to a hotel" };
    }
    try {
      const metrics = await getDashboardMetrics(admin.hotelId, { startDate: query.startDate, endDate: query.endDate });
      return { success: true, data: metrics };
    } catch (err: any) {
      set.status = 400;
      return { success: false, error: err.message || "Unable to calculate dashboard metrics" };
    }
  }, { query: t.Object({ startDate: t.Optional(t.String({ pattern: "^\\d{4}-\\d{2}-\\d{2}$" })), endDate: t.Optional(t.String({ pattern: "^\\d{4}-\\d{2}-\\d{2}$" })) }) })
  .get("/pending-count", async ({ headers, jwt, set }) => {
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
    if (!admin.hotelId) {
      set.status = 403;
      return { success: false, error: "This account is not assigned to a hotel" };
    }
    const count = await getPendingOrdersCount(admin.hotelId);
    return { success: true, data: { count } };
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
    if (!admin.hotelId) {
      set.status = 403;
      return { success: false, error: "This account is not assigned to a hotel" };
    }
    const date = (query.date ?? new Date().toISOString().split("T")[0]) as string;
    const orders = await getDailyOrders(date, admin.hotelId);
    return { success: true, data: orders };
  }, {
    query: t.Object({
      date: t.Optional(t.String()),
    }),
  })
  // ─── Staff: Pending Collection worklist (payment + utensils, resolved independently) ───
  .get("/pending-collection", async ({ headers, jwt, set }) => {
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
      if (!admin.hotelId) throw new Error("This account is not assigned to a hotel");
      return { success: true, data: await getPendingCollection(admin.hotelId) };
    } catch (err: any) {
      set.status = 400;
      return { success: false, error: err.message };
    }
  })
  // ─── Staff: Refunds Owed worklist (cancelled + paid + not yet refunded) ───
  .get("/refunds-owed", async ({ headers, jwt, set }) => {
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
      if (!admin.hotelId) throw new Error("This account is not assigned to a hotel");
      return { success: true, data: await getRefundsOwed(admin.hotelId) };
    } catch (err: any) {
      set.status = 400;
      return { success: false, error: err.message };
    }
  })
  // ─── Staff: mark utensils issued at dispatch ───
  .patch("/:id/utensils-issued", async ({ params, body, headers, jwt, set }) => {
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
      if (!admin.hotelId) throw new Error("This account is not assigned to a hotel");
      const updated = await markUtensilsIssued(params.id, admin.hotelId, body.issued === true);
      return { success: true, data: updated };
    } catch (err: any) {
      set.status = 400;
      return { success: false, error: err.message };
    }
  }, { params: IdParamSchema, body: t.Object({ issued: t.Boolean({ default: true }) }) })
  // ─── Staff: confirm utensils returned ───
  .patch("/:id/utensils-returned", async ({ params, headers, jwt, set }) => {
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
      if (!admin.hotelId) throw new Error("This account is not assigned to a hotel");
      const updated = await markUtensilsReturned(params.id, admin.hotelId, admin.id);
      return { success: true, data: updated };
    } catch (err: any) {
      set.status = 400;
      return { success: false, error: err.message };
    }
  }, { params: IdParamSchema })
.get(
    "/:id",
    async ({ params, headers, jwt, set }) => {
      try {
        const authHeader = headers["authorization"];
        if (authHeader?.startsWith("Bearer ")) {
          const token = authHeader.slice(7);
          try {
            const admin = await verifyAdminToken(token, (t) => jwt.verify(t));
            if (!admin.hotelId) throw new Error("This account is not assigned to a hotel");
            const order = await getOrderById(params.id, admin.hotelId);
            return { success: true, data: order };
          } catch (adminError) {
            const customerId = await verifyCustomerToken(token, (t) => jwt.verify(t));
            if (!customerId) throw adminError;
            const order = await getOrderForCustomer(params.id, customerId);
            return { success: true, data: order };
          }
        }
        const guestId = headers["x-guest-id"];
        if (!isGuestId(guestId)) throw new Error("Sign in or use the original guest session to track this order");
        const guest = await ensureGuestIdentity(guestId);
        if (!guest.customerId) throw new Error("Order not found");
        const order = await getOrderForCustomer(params.id, guest.customerId);
        return { success: true, data: order };
      } catch (err: any) {
        set.status = err.message?.includes("Sign in") ? 401 : 404;
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
        if (!admin.hotelId) throw new Error("This account is not assigned to a hotel");
        const updated = await updateOrderStatus(params.id, body.status as OrderStatus, body.cancelReason, admin.hotelId);
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
