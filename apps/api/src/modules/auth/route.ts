/**
 * Purpose: Authentication API routes for tableDash Admin login.
 * Responsibilities: Handles POST /api/v1/auth/login and GET /api/v1/auth/me endpoints.
 * Dependencies: Elysia, shared/config.ts, shared/schemas.ts, auth service.
 * When to modify: When adding new authentication endpoints or changing auth response structures.
 */

import { jwt } from "@elysiajs/jwt";
import { Elysia } from "elysia";
import { env } from "../../../../../shared/config";
import { AdminLoginSchema } from "../../../../../shared/schemas";
import { loginAdmin, verifyAdminToken } from "./service";

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
    async ({ body, jwt, set }) => {
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
