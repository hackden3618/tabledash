/**
 * Purpose: Authentication API routes for tableDash Admin login.
 * Responsibilities: Handles POST /api/v1/auth/login and GET /api/v1/auth/me endpoints.
 * Dependencies: Elysia, shared/config.ts, shared/schemas.ts, auth service.
 * When to modify: When adding new authentication endpoints or changing auth response structures.
 */

import { jwt } from "@elysiajs/jwt";
import { Elysia, t } from "elysia";
import { env } from "../../../../../shared/config";
import { PHONE_PATTERN, PHONE_MIN, PHONE_MAX } from "../../../../../shared/phone";
import { AdminLoginSchema } from "../../../../../shared/schemas";
import { loginAdmin, verifyAdminToken, requestPasswordResetOtp, resetPasswordWithOtp, updateAdminProfile, changeAdminPassword, createWebSocketTicket, switchAdminHotel } from "./service";
import { verifyCustomerToken } from "../customers/auth.service";
import { verifyPlatformAdminToken } from "./service";
import { ensureGuestIdentity, isGuestId } from "../customers/guest-identity";
import { AUTH_LIMITER } from "../../lib/rate-limiter";

export const authRoute = new Elysia({
  prefix: `${env.apiPrefix}/auth`,
  detail: {
    summary: "Admin Authentication Endpoints",
    tags: ["Auth"],
  },
})
  .use(
    jwt({
      name: "jwt",
      secret: env.jwtSecret,
    })
  )
  .post(
    "/login",
    async ({ body, jwt, set, request }) => {
      const ip = request.headers.get("x-forwarded-for") ?? "unknown";
      const { allowed, remaining, resetIn } = AUTH_LIMITER(`login:${ip}`);
      if (!allowed) {
        set.status = 429;
        set.headers["retry-after"] = String(Math.ceil(resetIn / 1000));
        return { success: false, error: `Too many attempts. Try again in ${Math.ceil(resetIn / 1000)}s.` };
      }
      try {
        const result = await loginAdmin(body.username, body.password, (payload) => jwt.sign(payload));
        return {
          success: true,
          data: result,
        };
      } catch (error: any) {
        set.status = 401;
        return {
          success: false,
          error: error.message || "Authentication failed",
        };
      }
    },
    {
      body: AdminLoginSchema,
    }
  )
  .post(
    "/switch-hotel",
    async ({ body, headers, jwt, set }) => {
      const authHeader = headers["authorization"];
      if (!authHeader?.startsWith("Bearer ")) {
        set.status = 401;
        return { success: false, error: "Missing or invalid authorization header" };
      }
      try {
        const admin = await verifyAdminToken(authHeader.slice(7), (t) => jwt.verify(t));
        const result = await switchAdminHotel(admin.id, body.hotelId, (payload) => jwt.sign(payload));
        return { success: true, data: result };
      } catch (err: any) {
        set.status = 401;
        return { success: false, error: err.message || "Unable to switch hotel" };
      }
    },
    { body: t.Object({ hotelId: t.String({ minLength: 1 }) }) }
  )
  .post(
    "/forgot-password",
    async ({ body, set, request }) => {
      const ip = request.headers.get("x-forwarded-for") ?? "unknown";
      const { allowed, remaining, resetIn } = AUTH_LIMITER(`otp:${ip}`);
      if (!allowed) {
        set.status = 429;
        set.headers["retry-after"] = String(Math.ceil(resetIn / 1000));
        return { success: false, error: `Too many attempts. Try again in ${Math.ceil(resetIn / 1000)}s.` };
      }
      try {
        await requestPasswordResetOtp(body.phone);
        return { success: true, data: { message: "OTP sent to your phone if the number is registered" } };
      } catch (err: any) {
        set.status = 400;
        return { success: false, error: err.message || "Failed to send OTP" };
      }
    },
    {
      body: t.Object({ phone: t.String({ minLength: 10, maxLength: 13 }) }),
    }
  )
  .post("/ws-ticket", async ({ headers, jwt, set }) => {
    try {
      const authorization = headers["authorization"];
      if (authorization?.startsWith("Bearer ")) {
        const token = authorization.slice(7).trim();
        const customerId = await verifyCustomerToken(token, (value) => jwt.verify(value));
        if (customerId) {
          return { success: true, data: { ticket: await createWebSocketTicket({ actorType: "customer", sub: customerId }, (payload) => jwt.sign(payload)) } };
        }
        try {
          const admin = await verifyAdminToken(token, (value) => jwt.verify(value));
          if (admin.hotelId) {
            return { success: true, data: { ticket: await createWebSocketTicket({ actorType: "hotel_staff", sub: admin.id, hotelId: admin.hotelId }, (payload) => jwt.sign(payload)) } };
          }
        } catch {}
        const platform = await verifyPlatformAdminToken(token, (value) => jwt.verify(value));
        return { success: true, data: { ticket: await createWebSocketTicket({ actorType: "platform_admin", sub: platform.id }, (payload) => jwt.sign(payload)) } };
      }

      const guestId = headers["x-guest-id"];
      if (!isGuestId(guestId)) throw new Error("Authentication required");
      await ensureGuestIdentity(guestId);
      return { success: true, data: { ticket: await createWebSocketTicket({ actorType: "guest", sub: guestId }, (payload) => jwt.sign(payload)) } };
    } catch {
      set.status = 401;
      return { success: false, error: "Unable to authorize realtime session" };
    }
  })
  .post(
    "/reset-password",
    async ({ body, set, request }) => {
      const ip = request.headers.get("x-forwarded-for") ?? "unknown";
      const { allowed, resetIn } = AUTH_LIMITER(`reset-password:${ip}`);
      if (!allowed) {
        set.status = 429;
        set.headers["retry-after"] = String(Math.ceil(resetIn / 1000));
        return { success: false, error: `Too many attempts. Try again in ${Math.ceil(resetIn / 1000)}s.` };
      }
      try {
        await resetPasswordWithOtp(body.phone, body.otp, body.newPassword);
        return { success: true, data: { message: "Password reset successfully" } };
      } catch (err: any) {
        set.status = 400;
        return { success: false, error: err.message || "Failed to reset password" };
      }
    },
    {
      body: t.Object({
        phone: t.String({ minLength: 10, maxLength: 13 }),
        otp: t.String({ minLength: 6, maxLength: 6 }),
        // Customer PIN resets are still validated by the customer flow; admin
        // resets are additionally enforced at the service layer at 8 chars.
        newPassword: t.String({ minLength: 4 }),
      }),
    }
  )
  .get("/me", async ({ headers, jwt, set }) => {
    const authHeader = headers["authorization"];
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      set.status = 401;
      return { success: false, error: "Missing or invalid authorization header" };
    }

    const token = authHeader.split(" ")[1] ?? "";
    try {
      const user = await verifyAdminToken(token, (t) => jwt.verify(t));
      return { success: true, data: user };
    } catch (error: any) {
      set.status = 401;
      return { success: false, error: error.message || "Invalid token" };
    }
  })
  .patch("/me", async ({ headers, jwt, body, set }) => {
    const authHeader = headers["authorization"];
    if (!authHeader?.startsWith("Bearer ")) { set.status = 401; return { success: false, error: "Missing or invalid authorization header" }; }
    try {
      const admin = await verifyAdminToken(authHeader.slice(7), (t) => jwt.verify(t));
      if (body.currentPassword || body.newPassword) {
        if (!body.currentPassword || !body.newPassword) throw new Error("Current and new passwords are required");
        await changeAdminPassword(admin.id, body.currentPassword, body.newPassword);
      }
      const profile = body.name !== undefined || body.username !== undefined ? await updateAdminProfile(admin.id, body) : admin;
      return { success: true, data: profile };
    } catch (err: any) { set.status = err.code === "P2002" ? 409 : 400; return { success: false, error: err.code === "P2002" ? "That username is already in use." : err.message || "Unable to update profile" }; }
  }, { body: t.Object({ name: t.Optional(t.String({ minLength: 1, maxLength: 100 })), username: t.Optional(t.String({ minLength: 3, maxLength: 80 })), currentPassword: t.Optional(t.String({ minLength: 1 })), newPassword: t.Optional(t.String({ minLength: 8, maxLength: 120 })) }) });
