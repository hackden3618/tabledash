/**
 * Purpose: REST API endpoints for Customer Management, History & Authentication.
 * Responsibilities: Handles GET /customers, GET /customers/:id/orders, POST /customers/register,
 *   POST /customers/login, and GET /customers/me endpoints.
 * Dependencies: Elysia, shared/config.ts, shared/schemas.ts, customer service, auth service.
 * When to modify: When adding new customer endpoints or altering route parameters.
 */

import { jwt } from "@elysiajs/jwt";
import { Elysia, t } from "elysia";
import { env } from "../../../../../shared/config";
import {
  CustomerLoginSchema,
  CustomerRegisterSchema,
  CustomerSendOtpSchema,
  CustomerForgotPinSchema,
  CustomerResetPinSchema,
  IdParamSchema,
} from "../../../../../shared/schemas";
import { getAllCustomers, getCustomerHistory } from "./service";
import { getCustomerProfile, loginCustomer, registerCustomer, sendRegistrationOtp, verifyCustomerToken, generatePinResetCode, resetCustomerPin, updateCustomerProfile, verifyPhoneChangeOtp } from "./auth.service";
import { verifyAdminToken } from "../auth/service";
import { AUTH_LIMITER } from "../../lib/rate-limiter";

function requireHotelAccount(admin: { hotelId: string | null }): string {
  if (!admin.hotelId) throw new Error("This account is not assigned to a hotel");
  return admin.hotelId;
}

export const customersRoute = new Elysia({
  prefix: `${env.apiPrefix}/customers`,
  detail: {
    summary: "Customer profile, order history, and authentication endpoints",
    tags: ["Customers"],
  },
})
  .use(
    jwt({
      name: "jwt",
      secret: env.jwtSecret,
    })
  )
  // ─── Admin: List all customers ───────────────────────────────────────────────
  .get("/", async ({ headers, jwt, set }) => {
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
    let hotelId: string;
    try { hotelId = requireHotelAccount(admin); } catch (err: any) { set.status = 403; return { success: false, error: err.message }; }
    const customers = await getAllCustomers(hotelId);
    return { success: true, data: customers };
  })

  // ─── Admin: Customer order history ───────────────────────────────────────────
  .get(
    "/:id/orders",
    async ({ params, headers, jwt, set }) => {
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
      const history = await getCustomerHistory(params.id, requireHotelAccount(admin));
      return { success: true, data: history };
    } catch (err: any) {
      set.status = 404;
      return { success: false, error: err.message };
    }
    },
    { params: IdParamSchema }
  )

  // ─── Customer: Send registration OTP ────────────────────────────────────────
  .post(
    "/send-registration-otp",
    async ({ body, set, request }) => {
      const ip = request.headers.get("x-forwarded-for") ?? "unknown";
      const { allowed, resetIn } = AUTH_LIMITER(`customer-otp:${ip}`);
      if (!allowed) {
        set.status = 429;
        set.headers["retry-after"] = String(Math.ceil(resetIn / 1000));
        return { success: false, error: `Too many attempts. Try again in ${Math.ceil(resetIn / 1000)}s.` };
      }
      try {
        const result = await sendRegistrationOtp(body.phone);
        return { success: true, data: result };
      } catch (err: any) {
        set.status = 400;
        return { success: false, error: err.message };
      }
    },
    { body: CustomerSendOtpSchema }
  )

  // ─── Customer: Register (phone + OTP + PIN) ─────────────────────────────────
  .post(
    "/register",
    async ({ body, jwt, set, request, headers }) => {
      const ip = request.headers.get("x-forwarded-for") ?? "unknown";
      const { allowed, resetIn } = AUTH_LIMITER(`customer-register:${ip}`);
      if (!allowed) {
        set.status = 429;
        set.headers["retry-after"] = String(Math.ceil(resetIn / 1000));
        return { success: false, error: `Too many attempts. Try again in ${Math.ceil(resetIn / 1000)}s.` };
      }
      try {
        const result = await registerCustomer(body, (payload) => jwt.sign(payload), headers["x-guest-id"]);
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
    async ({ body, jwt, set, request }) => {
      const ip = request.headers.get("x-forwarded-for") ?? "unknown";
      const { allowed, resetIn } = AUTH_LIMITER(`customer-login:${ip}`);
      if (!allowed) {
        set.status = 429;
        set.headers["retry-after"] = String(Math.ceil(resetIn / 1000));
        return { success: false, error: `Too many attempts. Try again in ${Math.ceil(resetIn / 1000)}s.` };
      }
      try {
        const result = await loginCustomer(body, (payload) => jwt.sign(payload));
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
    async ({ headers, jwt, set }) => {
      const auth = headers["authorization"] ?? "";
      const token = auth.replace("Bearer ", "").trim();
      const customerId = await verifyCustomerToken(token, (t) => jwt.verify(t));

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
  )
  .patch("/me", async ({ headers, jwt, body, set }) => {
    const auth = headers["authorization"] ?? "";
    const customerId = await verifyCustomerToken(auth.replace("Bearer ", "").trim(), (t) => jwt.verify(t));
    if (!customerId) { set.status = 401; return { success: false, error: "Invalid or missing token" }; }
    try {
      return { success: true, data: await updateCustomerProfile(customerId, body, body.pin) };
    } catch (err: any) {
      set.status = err.code === "P2002" ? 409 : 400;
      return { success: false, error: err.code === "P2002" ? "That phone number is already in use." : err.message || "Unable to update profile" };
    }
  }, { body: t.Object({ firstName: t.Optional(t.String({ minLength: 1, maxLength: 80 })), lastName: t.Optional(t.String({ maxLength: 80 })), phone: t.Optional(t.String({ minLength: 9, maxLength: 13 })), knownName: t.Optional(t.Union([t.String({ maxLength: 80 }), t.Null()])), pin: t.Optional(t.String({ minLength: 4, maxLength: 4 })) }) })

  // ─── Customer: Change phone — send OTP to new number ──────────────
  .post(
    "/me/change-phone",
    async ({ headers, jwt, body, set }) => {
      const auth = headers["authorization"] ?? "";
      const customerId = await verifyCustomerToken(auth.replace("Bearer ", "").trim(), (t) => jwt.verify(t));
      if (!customerId) { set.status = 401; return { success: false, error: "Invalid or missing token" }; }
      try {
        return { success: true, data: await updateCustomerProfile(customerId, { phone: body.newPhone }, body.pin) };
      } catch (err: any) {
        set.status = 400;
        return { success: false, error: err.message };
      }
    },
    { body: t.Object({ newPhone: t.String({ minLength: 9, maxLength: 13 }), pin: t.Optional(t.String({ minLength: 4, maxLength: 4 })) }) }
  )

  // ─── Customer: Verify phone change OTP ─────────────────────────────
  .post(
    "/me/change-phone/verify",
    async ({ headers, jwt, body, set }) => {
      const auth = headers["authorization"] ?? "";
      const customerId = await verifyCustomerToken(auth.replace("Bearer ", "").trim(), (t) => jwt.verify(t));
      if (!customerId) { set.status = 401; return { success: false, error: "Invalid or missing token" }; }
      try {
        return { success: true, data: await verifyPhoneChangeOtp(customerId, body.otp) };
      } catch (err: any) {
        set.status = 400;
        return { success: false, error: err.message };
      }
    },
    { body: t.Object({ otp: t.String({ minLength: 4, maxLength: 4 }) }) }
  )

  // ─── Customer: Forgot PIN (request reset code) ────────────────────────────────
  .post(
    "/forgot-pin",
    async ({ body, set }) => {
      try {
        const result = await generatePinResetCode(body.phone);
        return { success: true, data: result };
      } catch (err: any) {
        set.status = 404;
        return { success: false, error: err.message };
      }
    },
    { body: CustomerForgotPinSchema }
  )

  // ─── Customer: Reset PIN (validate OTP + set new PIN) ─────────────────────────
  .post(
    "/reset-pin",
    async ({ body, set }) => {
      try {
        const result = await resetCustomerPin(body);
        return { success: true, data: result };
      } catch (err: any) {
        set.status = 400;
        return { success: false, error: err.message };
      }
    },
    { body: CustomerResetPinSchema }
  );
