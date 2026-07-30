import { jwt } from "@elysiajs/jwt";
import { Elysia, t } from "elysia";
import { env } from "../../../../../shared/config";
import { verifyAdminToken } from "../auth/service";
import { getFinanceDashboard, getCustomerAccount, getLedgerEntries, createLedgerEntry, getDailyLedgers, reconcileCash, getReports } from "./service";

export const financeRoute = new Elysia({
  prefix: `${env.apiPrefix}/finance`,
  detail: { summary: "Financial management — ledger, reconciliation, reports", tags: ["Finance"] },
})
  .use(jwt({ name: "jwt", secret: env.jwtSecret }))

  .get("/dashboard", async ({ headers, jwt, set }) => {
    const auth = headers["authorization"];
    if (!auth?.startsWith("Bearer ")) { set.status = 401; return { success: false, error: "Authentication required" }; }
    try {
      const admin = await verifyAdminToken(auth.split(" ")[1]!, (t: any) => jwt.verify(t));
      if (!admin.hotelId) throw new Error("This account is not assigned to a hotel");
      return { success: true, data: await getFinanceDashboard(admin.hotelId) };
    } catch (err: any) {
      set.status = 403;
      return { success: false, error: err.message };
    }
  })

  .get("/customers/:id/account", async ({ headers, jwt, params, set }) => {
    const auth = headers["authorization"];
    if (!auth?.startsWith("Bearer ")) { set.status = 401; return { success: false, error: "Authentication required" }; }
    try {
      const admin = await verifyAdminToken(auth.split(" ")[1]!, (t: any) => jwt.verify(t));
      if (!admin.hotelId) throw new Error("This account is not assigned to a hotel");
      return { success: true, data: await getCustomerAccount(params.id, admin.hotelId) };
    } catch (err: any) {
      set.status = 403;
      return { success: false, error: err.message };
    }
  }, { params: t.Object({ id: t.String({ format: "uuid" }) }) })

  .get("/ledger", async ({ headers, jwt, query, set }) => {
    const auth = headers["authorization"];
    if (!auth?.startsWith("Bearer ")) { set.status = 401; return { success: false, error: "Authentication required" }; }
    try {
      const admin = await verifyAdminToken(auth.split(" ")[1]!, (t: any) => jwt.verify(t));
      if (!admin.hotelId) throw new Error("This account is not assigned to a hotel");
      return { success: true, data: await getLedgerEntries(admin.hotelId, query.customerId, query.limit ? Number(query.limit) : 100) };
    } catch (err: any) {
      set.status = 403;
      return { success: false, error: err.message };
    }
  }, { query: t.Object({ customerId: t.Optional(t.String()), limit: t.Optional(t.String()) }) })

  .get("/daily", async ({ headers, jwt, query, set }) => {
    const auth = headers["authorization"];
    if (!auth?.startsWith("Bearer ")) { set.status = 401; return { success: false, error: "Authentication required" }; }
    try {
      const admin = await verifyAdminToken(auth.split(" ")[1]!, (t: any) => jwt.verify(t));
      if (!admin.hotelId) throw new Error("This account is not assigned to a hotel");
      const date = (query.date ?? new Date().toISOString().split("T")[0]) as string;
      return { success: true, data: await getDailyLedgers(admin.hotelId, date) };
    } catch (err: any) {
      set.status = 403;
      return { success: false, error: err.message };
    }
  }, { query: t.Object({ date: t.Optional(t.String()) }) })

  .post("/reconcile", async ({ headers, jwt, body, set }) => {
    const auth = headers["authorization"];
    if (!auth?.startsWith("Bearer ")) { set.status = 401; return { success: false, error: "Authentication required" }; }
    try {
      const admin = await verifyAdminToken(auth.split(" ")[1]!, (t: any) => jwt.verify(t));
      if (!admin.hotelId) throw new Error("This account is not assigned to a hotel");
      return { success: true, data: await reconcileCash(admin.hotelId, body.date, body.expectedCash, body.countedCash, body.varianceReason, admin.name) };
    } catch (err: any) {
      set.status = 400;
      return { success: false, error: err.message };
    }
  }, { body: t.Object({ date: t.String(), expectedCash: t.Number(), countedCash: t.Number(), varianceReason: t.Optional(t.String()) }) })

  .get("/reports", async ({ headers, jwt, query, set }) => {
    const auth = headers["authorization"];
    if (!auth?.startsWith("Bearer ")) { set.status = 401; return { success: false, error: "Authentication required" }; }
    try {
      const admin = await verifyAdminToken(auth.split(" ")[1]!, (t: any) => jwt.verify(t));
      if (!admin.hotelId) throw new Error("This account is not assigned to a hotel");
      const from = (query.from ?? new Date(Date.now() - 30 * 86400000).toISOString().split("T")[0]) as string;
      const to = (query.to ?? new Date().toISOString().split("T")[0]) as string;
      return { success: true, data: await getReports(admin.hotelId, from, to) };
    } catch (err: any) {
      set.status = 403;
      return { success: false, error: err.message };
    }
  }, { query: t.Object({ from: t.Optional(t.String()), to: t.Optional(t.String()) }) })

  .post("/ledger", async ({ headers, jwt, body, set }) => {
    const auth = headers["authorization"];
    if (!auth?.startsWith("Bearer ")) { set.status = 401; return { success: false, error: "Authentication required" }; }
    try {
      const admin = await verifyAdminToken(auth.split(" ")[1]!, (t: any) => jwt.verify(t));
      if (!admin.hotelId) throw new Error("This account is not assigned to a hotel");
      const entry = await createLedgerEntry({ ...body, hotelId: admin.hotelId, createdBy: admin.name });
      return { success: true, data: entry };
    } catch (err: any) {
      set.status = 400;
      return { success: false, error: err.message };
    }
  }, { body: t.Object({ customerId: t.String({ format: "uuid" }), type: t.Enum({ ORDER_CHARGE: "ORDER_CHARGE", CASH_PAYMENT: "CASH_PAYMENT", PARTIAL_PAYMENT: "PARTIAL_PAYMENT", REFUND: "REFUND", CREDIT_ADJUSTMENT: "CREDIT_ADJUSTMENT", MANUAL_ADJUSTMENT: "MANUAL_ADJUSTMENT", FUTURE_ONLINE_PAYMENT: "FUTURE_ONLINE_PAYMENT" }), amount: t.Number(), orderId: t.Optional(t.String()), description: t.Optional(t.String()), reference: t.Optional(t.String()) }) });
