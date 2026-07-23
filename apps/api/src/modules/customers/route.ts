/**
 * Purpose: REST API endpoints for Customer Management, History & Authentication.
 * Responsibilities: Handles GET /customers, GET /customers/:id/orders, POST /customers/register,
 *   POST /customers/login, and GET /customers/me endpoints.
 * Dependencies: Elysia, shared/config.ts, shared/schemas.ts, customer service, auth service.
 * When to modify: When adding new customer endpoints or altering route parameters.
 */

import { Elysia, t } from "elysia";
import { env } from "../../../../../shared/config";
import {
  CustomerLoginSchema,
  CustomerRegisterSchema,
  IdParamSchema,
} from "../../../../../shared/schemas";
import { getAllCustomers, getCustomerHistory } from "./service";
import { decodeCustomerToken, getCustomerProfile, loginCustomer, registerCustomer } from "./auth.service";

export const customersRoute = new Elysia({
  prefix: `${env.apiPrefix}/customers`,
  detail: {
    summary: "Customer profile, order history, and authentication endpoints",
    tags: ["Customers"],
  },
})
  // ─── Admin: List all customers ───────────────────────────────────────────────
  .get("/", async () => {
    const customers = await getAllCustomers();
    return { success: true, data: customers };
  })

  // ─── Admin: Customer order history ───────────────────────────────────────────
  .get(
    "/:id/orders",
    async ({ params, set }) => {
      try {
        const history = await getCustomerHistory(params.id);
        return { success: true, data: history };
      } catch (err: any) {
        set.status = 404;
        return { success: false, error: err.message };
      }
    },
    { params: IdParamSchema }
  )

  // ─── Customer: Register (phone + PIN) ────────────────────────────────────────
  .post(
    "/register",
    async ({ body, set }) => {
      try {
        const result = await registerCustomer(body);
        set.status = 201;
        return { success: true, data: result };
      } catch (err: any) {
        set.status = 400;
        return { success: false, error: err.message };
      }
    },
    { body: CustomerRegisterSchema }
  )

  // ─── Customer: Login (phone + PIN) ────────────────────────────────────────────
  .post(
    "/login",
    async ({ body, set }) => {
      try {
        const result = await loginCustomer(body);
        return { success: true, data: result };
      } catch (err: any) {
        set.status = 401;
        return { success: false, error: err.message };
      }
    },
    { body: CustomerLoginSchema }
  )

  // ─── Customer: Get own profile (requires Bearer token) ───────────────────────
  .get(
    "/me",
    async ({ headers, set }) => {
      const auth = headers["authorization"] ?? "";
      const token = auth.replace("Bearer ", "").trim();
      const customerId = decodeCustomerToken(token);

      if (!customerId) {
        set.status = 401;
        return { success: false, error: "Invalid or missing token" };
      }

      try {
        const profile = await getCustomerProfile(customerId);
        return { success: true, data: profile };
      } catch (err: any) {
        set.status = 404;
        return { success: false, error: err.message };
      }
    },
    {
      // Declare headers so Elysia doesn't strip authorization
      headers: t.Object({ authorization: t.Optional(t.String()) }),
    }
  );
