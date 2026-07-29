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
import { loginAdmin, verifyAdminToken, requestPasswordResetOtp, resetPasswordWithOtp } from "./service";
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
        newPassword: t.String({ minLength: 6 }),
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
  });
