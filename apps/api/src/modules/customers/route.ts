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
import { getAllCustomers, getCustomerHistory, lookupCustomerByPhone } from "./service";
import { getCustomerProfile, loginCustomer, registerCustomer, sendRegistrationOtp, generatePinResetCode, resetCustomerPin, updateCustomerProfile, verifyPhoneChangeOtp, sendRecipientVerificationOtp, confirmRecipientVerificationOtp, sendOwnPhoneOtp, confirmOwnPhoneOtp, verifyCustomerToken } from "./auth.service";
import { verifyAdminToken } from "../auth/service";
import { AUTH_LIMITER } from "../../lib/rate-limiter";
import { prisma } from "../../../../../infrastructure/database/prisma";

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

  // ─── Public: Look up a customer by phone (on-behalf ordering) ───────────────
  .get(
    "/lookup",
    async ({ query, set, request }) => {
      const ip = request.headers.get("x-forwarded-for") ?? "unknown";
      const { allowed, resetIn } = AUTH_LIMITER(`customer-lookup:${ip}`);
      if (!allowed) {
        set.status = 429;
        set.headers["retry-after"] = String(Math.ceil(resetIn / 1000));
        return { success: false, error: `Too many attempts. Try again in ${Math.ceil(resetIn / 1000)}s.` };
      }
      try {
        return { success: true, data: await lookupCustomerByPhone(query.phone) };
      } catch (err: any) {
        set.status = 400;
        return { success: false, error: err.message };
      }
    },
    { query: t.Object({ phone: t.String({ minLength: 9, maxLength: 13 }) }) }
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

  // ─── On-behalf recipient verification ───────────────────────────────────────
  // Proves a phone number entered into the "order for someone else" flow belongs
  // to someone who received the OTP — no order can be attributed to a number the
  // owner never confirmed.
  .post(
    "/recipient-verify/send",
    async ({ body, set, request }) => {
      const ip = request.headers.get("x-forwarded-for") ?? "unknown";
      const { allowed, resetIn } = AUTH_LIMITER(`recipient-verify-send:${ip}`);
      if (!allowed) {
        set.status = 429;
        set.headers["retry-after"] = String(Math.ceil(resetIn / 1000));
        return { success: false, error: `Too many attempts. Try again in ${Math.ceil(resetIn / 1000)}s.` };
      }
      try {
        return { success: true, data: await sendRecipientVerificationOtp(body.phone) };
      } catch (err: any) {
        set.status = 400;
        return { success: false, error: err.message };
      }
    },
    { body: t.Object({ phone: t.String({ minLength: 9, maxLength: 13 }) }) }
  )
  .post(
    "/recipient-verify/confirm",
    async ({ body, set, request }) => {
      const ip = request.headers.get("x-forwarded-for") ?? "unknown";
      const { allowed, resetIn } = AUTH_LIMITER(`recipient-verify-confirm:${ip}`);
      if (!allowed) {
        set.status = 429;
        set.headers["retry-after"] = String(Math.ceil(resetIn / 1000));
        return { success: false, error: `Too many attempts. Try again in ${Math.ceil(resetIn / 1000)}s.` };
      }
      try {
        return { success: true, data: await confirmRecipientVerificationOtp(body.phone, body.otp) };
      } catch (err: any) {
        set.status = 400;
        return { success: false, error: err.message };
      }
    },
    { body: t.Object({ phone: t.String({ minLength: 9, maxLength: 13 }), otp: t.String({ minLength: 4, maxLength: 4 }) }) }
  )

  // ─── Own phone verification ───────────────────────────────────────
  // Delays surfacing account details until the orderer proves they hold
  // the phone number. Prevents ghost histories on shared browsers.
  .post(
    "/phone-otp/send",
    async ({ body, set, request }) => {
      const ip = request.headers.get("x-forwarded-for") ?? "unknown";
      const { allowed, resetIn } = AUTH_LIMITER(`own-phone-otp-send:${ip}`);
      if (!allowed) {
        set.status = 429;
        set.headers["retry-after"] = String(Math.ceil(resetIn / 1000));
        return { success: false, error: `Too many attempts. Try again in ${Math.ceil(resetIn / 1000)}s.` };
      }
      try {
        return { success: true, data: await sendOwnPhoneOtp(body.phone) };
      } catch (err: any) {
        set.status = 400;
        return { success: false, error: err.message };
      }
    },
    { body: t.Object({ phone: t.String({ minLength: 9, maxLength: 13 }) }) }
  )
  .post(
    "/phone-otp/confirm",
    async ({ body, set, request }) => {
      const ip = request.headers.get("x-forwarded-for") ?? "unknown";
      const { allowed, resetIn } = AUTH_LIMITER(`own-phone-otp-confirm:${ip}`);
      if (!allowed) {
        set.status = 429;
        set.headers["retry-after"] = String(Math.ceil(resetIn / 1000));
        return { success: false, error: `Too many attempts. Try again in ${Math.ceil(resetIn / 1000)}s.` };
      }
      try {
        return { success: true, data: await confirmOwnPhoneOtp(body.phone, body.otp) };
      } catch (err: any) {
        set.status = 400;
        return { success: false, error: err.message };
      }
    },
    { body: t.Object({ phone: t.String({ minLength: 9, maxLength: 13 }), otp: t.String({ minLength: 4, maxLength: 4 }) }) }
  )

  // ─── Customer: Register (phone + OTP + PIN) ─────────────────────────
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
  }, { body: t.Object({ firstName: t.Optional(t.String({ minLength: 1, maxLength: 80 })), lastName: t.Optional(t.String({ maxLength: 80 })), phone: t.Optional(t.String({ minLength: 9, maxLength: 13 })), knownName: t.Optional(t.Union([t.String({ maxLength: 80 }), t.Null()])), pin: t.Optional(t.String({ minLength: 4, maxLength: 4 })), townRegionId: t.Optional(t.Union([t.String({ format: "uuid" }), t.Null()])) }) })

  // ─── Customer: persistent cart (authenticated customers only) ────────────
  .get("/me/cart", async ({ headers, jwt, set }) => {
    const customerId = await verifyCustomerToken((headers.authorization ?? "").replace("Bearer ", "").trim(), (t) => jwt.verify(t));
    if (!customerId) { set.status = 401; return { success: false, error: "Invalid or missing token" }; }
    const cart = await prisma.customerCart.findUnique({
      where: { customerId },
      include: { items: { include: { product: { include: { hotel: { select: { name: true } } } } } } },
    });
    return { success: true, data: (cart?.items ?? []).filter((item) => !item.product.deleted).map((item) => ({
      id: item.product.id, name: item.product.name, price: Number(item.product.price), imageUrl: item.product.imageUrl,
      quantity: item.quantity, hotelId: item.product.hotelId, hotelName: item.product.hotel.name,
      stockQty: item.product.stockQty, available: item.product.available,
    })) };
  })
  .put("/me/cart", async ({ headers, jwt, body, set }) => {
    const customerId = await verifyCustomerToken((headers.authorization ?? "").replace("Bearer ", "").trim(), (t) => jwt.verify(t));
    if (!customerId) { set.status = 401; return { success: false, error: "Invalid or missing token" }; }
    const quantities = new Map<string, number>();
    for (const item of body.items) quantities.set(item.productId, Math.max(1, Math.floor(item.quantity)));
    const productIds = [...quantities.keys()];
    const products = productIds.length ? await prisma.product.findMany({ where: { id: { in: productIds }, deleted: false }, select: { id: true } }) : [];
    if (products.length !== productIds.length) { set.status = 400; return { success: false, error: "One or more cart items are no longer available" }; }
    await prisma.customerCart.upsert({
      where: { customerId },
      create: { customerId, items: { create: products.map((product) => ({ productId: product.id, quantity: quantities.get(product.id)! })) } },
      update: { items: { deleteMany: {}, create: products.map((product) => ({ productId: product.id, quantity: quantities.get(product.id)! })) } },
    });
    return { success: true, data: { itemCount: products.length } };
  }, { body: t.Object({ items: t.Array(t.Object({ productId: t.String({ format: "uuid" }), quantity: t.Integer({ minimum: 1, maximum: 100 }) })) }) })

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
        set.status = err.code === "PHONE_IN_USE" || err.code === "P2002" ? 409 : 400;
        return { success: false, error: err.message || "Unable to start phone change" };
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
        set.status = err.code === "PHONE_IN_USE" || err.code === "P2002" ? 409 : 400;
        return { success: false, error: err.message || "Unable to verify phone change" };
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
