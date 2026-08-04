import { jwt } from "@elysiajs/jwt";
import { Elysia, t } from "elysia";
import { env } from "../../../../../shared/config";
import { verifyAdminToken } from "../auth/service";
import { verifyCustomerToken } from "../customers/auth.service";
import { ensureGuestIdentity, isGuestId } from "../customers/guest-identity";
import {
  getFinanceDashboard, getCustomerAccount, getOrderPaymentHistory, getSalesRecords,
  recordPayment, recordRefund, recordAdjustment, getWallet, getHotelWalletDetail,
  getNotifications, markNotificationRead, clearNotifications,
} from "./service";

const UUID = t.String({ format: "uuid", minLength: 1 });

export const financeRoute = new Elysia({
  prefix: `${env.apiPrefix}/finance`,
  detail: { summary: "Financial management — sales records, payments, customer accounts", tags: ["Finance"] },
})
  .use(jwt({ name: "jwt", secret: env.jwtSecret }))

  // ── Dashboard (admin) ──
  .get("/dashboard", async ({ headers, jwt, set }) => {
    try {
      const admin = await requireAdmin(headers, jwt);
      return { success: true, data: await getFinanceDashboard(admin.hotelId) };
    } catch (err: any) {
      set.status = 403;
      return { success: false, error: err.message };
    }
  })

  // ── Record payment against an order (replaces direct order payment update) ──
  .post("/orders/:orderId/payments", async ({ headers, jwt, params, body, set }) => {
    try {
      const admin = await requireAdmin(headers, jwt);
      const order = await findOrder(params.orderId, admin.hotelId);
      const result = await recordPayment(admin.hotelId, order.customerId, params.orderId, body.method, body.amount, admin.sub, body.note);
      return { success: true, data: result };
    } catch (err: any) {
      set.status = 400;
      return { success: false, error: err.message };
    }
  }, { params: t.Object({ orderId: UUID }), body: t.Object({ amount: t.Number({ minimum: 0.01 }), method: t.Enum({ CASH: "CASH", MPESA: "MPESA" }), note: t.Optional(t.String({ maxLength: 500 })) }) })

  // ── Unified refund / adjustment (reason required, admin-only) ──
  .post("/orders/:orderId/adjustments", async ({ headers, jwt, params, body, set }) => {
    try {
      const admin = await requireAdmin(headers, jwt);
      if (admin.role !== "HOTEL_ADMIN") {
        set.status = 403;
        return { success: false, error: "Only hotel administrators can issue refunds or adjustments." };
      }
      const order = await findOrder(params.orderId, admin.hotelId);
      if (!body.reason?.trim()) {
        set.status = 400;
        return { success: false, error: "A reason is required for a refund or adjustment." };
      }
      const result = body.type === "REFUND"
        ? await recordRefund(admin.hotelId, order.customerId, params.orderId, body.amount, body.reason, admin.sub)
        : await recordAdjustment(admin.hotelId, order.customerId, params.orderId, body.amount, body.reason, admin.sub);
      return { success: true, data: result };
    } catch (err: any) {
      set.status = 400;
      return { success: false, error: err.message };
    }
  }, { params: t.Object({ orderId: UUID }), body: t.Object({ amount: t.Number({ not: 0 }), type: t.Enum({ REFUND: "REFUND", ADJUSTMENT: "ADJUSTMENT" }), reason: t.String({ minLength: 2, maxLength: 500 }) }) })

  // ── Customer account view (admin) ──
  .get("/customers/:id/account", async ({ headers, jwt, params, set }) => {
    try {
      const admin = await requireAdmin(headers, jwt);
      return { success: true, data: await getCustomerAccount(params.id, admin.hotelId) };
    } catch (err: any) {
      set.status = 403;
      return { success: false, error: err.message };
    }
  }, { params: t.Object({ id: UUID }) })

  // ── Staff-facing customer account at a specific hotel (tenant-scoped) ──
  .get("/hotels/:hotelId/customers/:customerId", async ({ headers, jwt, params, set }) => {
    try {
      const admin = await requireAdmin(headers, jwt);
      if (params.hotelId !== admin.hotelId) {
        set.status = 403;
        return { success: false, error: "This account does not belong to your hotel" };
      }
      return { success: true, data: await getCustomerAccount(params.customerId, admin.hotelId) };
    } catch (err: any) {
      set.status = 403;
      return { success: false, error: err.message };
    }
  }, { params: t.Object({ hotelId: UUID, customerId: UUID }) })

  // ── Order payment history ──
  .get("/orders/:orderId/payments", async ({ headers, jwt, params, set }) => {
    try {
      const admin = await requireAdmin(headers, jwt);
      await findOrder(params.orderId, admin.hotelId);
      return { success: true, data: await getOrderPaymentHistory(params.orderId) };
    } catch (err: any) {
      set.status = 403;
      return { success: false, error: err.message };
    }
  }, { params: t.Object({ orderId: UUID }) })

  // ── Sales records query ──
  .get("/ledger", async ({ headers, jwt, query, set }) => {
    try {
      const admin = await requireAdmin(headers, jwt);
      const orderIds = query.orderIds?.split(",").filter(Boolean);
      return { success: true, data: await getSalesRecords(admin.hotelId, orderIds, query.limit ? Number(query.limit) : 100) };
    } catch (err: any) {
      set.status = 403;
      return { success: false, error: err.message };
    }
  }, { query: t.Object({ orderIds: t.Optional(t.String()), limit: t.Optional(t.String()) }) })

  // ── Customer wallet (identity-resolved: auth bearer or X-Guest-Id) ──
  .get("/wallet", async ({ headers, jwt, set }) => {
    try {
      const customerId = await resolveCustomerIdentity(headers, jwt);
      if (!customerId) return { success: true, data: { combinedBalance: 0, accounts: [] } };
      return { success: true, data: await getWallet(customerId) };
    } catch (err: any) {
      set.status = 403;
      return { success: false, error: err.message };
    }
  })

  // ── Per-hotel wallet drill-down ──
  .get("/wallet/:hotelId/history", async ({ headers, jwt, params, set }) => {
    try {
      const customerId = await resolveCustomerIdentity(headers, jwt);
      if (!customerId) { set.status = 401; return { success: false, error: "Authentication required" }; }
      return { success: true, data: await getHotelWalletDetail(customerId, params.hotelId) };
    } catch (err: any) {
      set.status = 403;
      return { success: false, error: err.message };
    }
  }, { params: t.Object({ hotelId: UUID }) })

  // Backward-compatible alias for the wallet drill-down
  .get("/wallet/:hotelId", async ({ headers, jwt, params, set }) => {
    try {
      const customerId = await resolveCustomerIdentity(headers, jwt);
      if (!customerId) { set.status = 401; return { success: false, error: "Authentication required" }; }
      return { success: true, data: await getHotelWalletDetail(customerId, params.hotelId) };
    } catch (err: any) {
      set.status = 403;
      return { success: false, error: err.message };
    }
  }, { params: t.Object({ hotelId: UUID }) })

  // ── Notifications (customer-facing, wallet-scoped) ──
  .get("/notifications", async ({ headers, jwt, set }) => {
    try {
      const customerId = await resolveCustomerIdentity(headers, jwt);
      if (!customerId) return { success: true, data: [] };
      return { success: true, data: await getNotifications(customerId) };
    } catch (err: any) {
      set.status = 403;
      return { success: false, error: err.message };
    }
  })

  .delete("/notifications", async ({ headers, jwt, set }) => {
    try {
      const customerId = await resolveCustomerIdentity(headers, jwt);
      if (!customerId) { set.status = 401; return { success: false, error: "Authentication required" }; }
      return { success: true, data: await clearNotifications(customerId) };
    } catch (err: any) {
      set.status = 403;
      return { success: false, error: err.message };
    }
  })

  .patch("/notifications/:id/read", async ({ headers, jwt, params, set }) => {
    try {
      const customerId = await resolveCustomerIdentity(headers, jwt);
      if (!customerId) { set.status = 401; return { success: false, error: "Authentication required" }; }
      return { success: true, data: await markNotificationRead(params.id, customerId) };
    } catch (err: any) {
      set.status = 403;
      return { success: false, error: err.message };
    }
  }, { params: t.Object({ id: UUID }) });

async function requireAdmin(headers: Record<string, string | undefined>, jwt: any) {
  const auth = headers["authorization"];
  if (!auth?.startsWith("Bearer ")) throw new Error("Authentication required");
  const token = auth.split(" ")[1]!;
  const admin = await verifyAdminToken(token, (t: any) => jwt.verify(t)) as any;
  if (!admin.hotelId) throw new Error("This account is not assigned to a hotel");
  return admin;
}

async function resolveCustomerIdentity(headers: Record<string, string | undefined>, jwt: any): Promise<string | null> {
  const auth = headers["authorization"];
  if (auth?.startsWith("Bearer ")) {
    const token = auth.split(" ")[1]!;
    try {
      const customerId = await verifyCustomerToken(token, (t: any) => jwt.verify(t));
      if (customerId) return customerId;
    } catch { }
  }
  const guestId = headers["x-guest-id"];
  if (isGuestId(guestId)) {
    const guest = await ensureGuestIdentity(guestId);
    return guest.customerId || null;
  }
  return null;
}

async function findOrder(orderId: string, hotelId: string) {
  const { prisma } = await import("../../../../../infrastructure/database/prisma");
  const order = await prisma.order.findFirst({ where: { id: orderId, hotelId } });
  if (!order) throw new Error("Order not found in this hotel");
  return order;
}
