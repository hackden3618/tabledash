/**
 * Purpose: REST API endpoints for Application Settings Management.
 * Responsibilities: Exposes GET and PATCH endpoints for reading/updating settings like hotel staff phone and hotel open/closed status with auto-close time.
 * Dependencies: Elysia, shared/config.ts, settings service.
 * When to modify: When adding new settings endpoints or changing route parameters.
 */

import { jwt } from "@elysiajs/jwt";
import { Elysia, t } from "elysia";
import { env } from "../../../../../shared/config";
import { PHONE_PATTERN, PHONE_MIN, PHONE_MAX } from "../../../../../shared/phone";
import {
  getHotelIsOpen,
  getHotelName,
  getHotelImageUrl,
  getStaffPhone,
  updateHotelIsOpen,
  updateStaffPhone,
  updateHotelImageUrl,
  getStaffUsers,
  addStaffUser,
  updateStaffUser,
  deleteStaffUser,
  provisionStaffLogin,
} from "./service";
import { verifyAdminToken } from "../auth/service";

export const settingsRoute = new Elysia({
  prefix: `${env.apiPrefix}/settings`,
  detail: {
    summary: "Application settings management endpoints",
    tags: ["Settings"],
  },
})
  .use(
    jwt({
      name: "jwt",
      secret: env.jwtSecret,
    })
  )
  .get("/", async ({ headers, jwt }) => {
    let adminHotelId: string | undefined;
    const authHeader = headers["authorization"];
    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.split(" ")[1] ?? "";
      try { const admin = await verifyAdminToken(token, (t) => jwt.verify(t)); adminHotelId = admin.hotelId ?? undefined; } catch {}
    }

    const staffPhone = await getStaffPhone();
    const status = await getHotelIsOpen(adminHotelId);
    const hotelName = await getHotelName(adminHotelId);
    const hotelImageUrl = await getHotelImageUrl(adminHotelId);
    return {
      success: true,
      data: {
        staffPhone,
        hotelName,
        hotelImageUrl,
        hotelIsOpen: status.isOpen,
        autoCloseAt: status.autoCloseAt,
      },
    };
  })
  .patch(
    "/",
    async ({ body, set, headers, jwt }) => {
      const authHeader = headers["authorization"];
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        set.status = 401;
        return { success: false, error: "Missing or invalid authorization header" };
      }
      const token = authHeader.split(" ")[1] ?? "";
      let admin;
      try { admin = await verifyAdminToken(token, (t) => jwt.verify(t)); }
      catch { set.status = 401; return { success: false, error: "Invalid or expired session token" }; }

      try {
        let staffPhone = await getStaffPhone();
        let status = await getHotelIsOpen(admin.hotelId ?? undefined);
        let hotelImageUrl: string | null = null;

        if (body.staffPhone !== undefined) {
          staffPhone = await updateStaffPhone(body.staffPhone);
        }

        if (body.hotelIsOpen !== undefined) {
          status = await updateHotelIsOpen(body.hotelIsOpen, body.autoCloseAt, admin.hotelId ?? undefined);
        }

        if (body.hotelImageUrl !== undefined) {
          hotelImageUrl = await updateHotelImageUrl(body.hotelImageUrl, admin.hotelId ?? undefined);
        }

        return {
          success: true,
          data: {
            staffPhone,
            hotelIsOpen: status.isOpen,
            autoCloseAt: status.autoCloseAt,
            hotelImageUrl,
          },
        };
      } catch (err: any) {
        set.status = 400;
        return { success: false, error: err.message };
      }
    },
    {
      body: t.Object({
        staffPhone: t.Optional(t.String({ minLength: PHONE_MIN, maxLength: PHONE_MAX, pattern: PHONE_PATTERN })),
        hotelIsOpen: t.Optional(t.Boolean()),
        autoCloseAt: t.Optional(t.Nullable(t.String())),
        hotelImageUrl: t.Optional(t.String()),
      }),
    }
  )
  .get(
    "/staff",
    async ({ headers, jwt, set }) => {
      const authHeader = headers["authorization"];
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        set.status = 401;
        return { success: false, error: "Missing or invalid authorization header" };
      }
      const token = authHeader.split(" ")[1] ?? "";
      let admin;
      try { admin = await verifyAdminToken(token, (t) => jwt.verify(t)); }
      catch { set.status = 401; return { success: false, error: "Invalid or expired session token" }; }

      const staff = await getStaffUsers(admin.hotelId ?? undefined);
      return { success: true, data: staff };
    }
  )
  .post(
    "/staff",
    async ({ body, set, headers, jwt }) => {
      const authHeader = headers["authorization"];
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        set.status = 401;
        return { success: false, error: "Missing or invalid authorization header" };
      }
      const token = authHeader.split(" ")[1] ?? "";
      let admin;
      try { admin = await verifyAdminToken(token, (t) => jwt.verify(t)); }
      catch { set.status = 401; return { success: false, error: "Invalid or expired session token" }; }

      try {
        const created = await addStaffUser(body, admin.hotelId ?? undefined);
        return { success: true, data: created };
      } catch (err: any) {
        set.status = 400;
        return { success: false, error: err.message };
      }
    },
    {
      body: t.Object({
        name: t.String({ minLength: 2 }),
        phone: t.String({ minLength: PHONE_MIN, maxLength: PHONE_MAX, pattern: PHONE_PATTERN }),
        receiveSms: t.Boolean(),
      }),
    }
  )
  .patch(
    "/staff/:id",
    async ({ params, body, set, headers, jwt }) => {
      const authHeader = headers["authorization"];
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        set.status = 401;
        return { success: false, error: "Missing or invalid authorization header" };
      }
      const token = authHeader.split(" ")[1] ?? "";
      let admin;
      try { admin = await verifyAdminToken(token, (t) => jwt.verify(t)); }
      catch { set.status = 401; return { success: false, error: "Invalid or expired session token" }; }

      try {
        const updated = await updateStaffUser(params.id, body, admin.hotelId ?? undefined);
        return { success: true, data: updated };
      } catch (err: any) {
        set.status = 400;
        return { success: false, error: err.message };
      }
    },
    {
      body: t.Object({
        name: t.Optional(t.String({ minLength: 2 })),
        phone: t.Optional(t.String({ minLength: PHONE_MIN, maxLength: PHONE_MAX, pattern: PHONE_PATTERN })),
        receiveSms: t.Optional(t.Boolean()),
      }),
    }
  )
  .post("/staff/:id/credentials", async ({ params, set, headers, jwt }) => {
    const authHeader = headers["authorization"];
    if (!authHeader?.startsWith("Bearer ")) { set.status = 401; return { success: false, error: "Missing or invalid authorization header" }; }
    try {
      const admin = await verifyAdminToken(authHeader.slice(7), (t) => jwt.verify(t));
      const staff = await provisionStaffLogin(params.id, admin.hotelId ?? undefined);
      return { success: true, data: staff };
    } catch (err: any) { set.status = 400; return { success: false, error: err.message || "Unable to provision staff login" }; }
  }, { params: t.Object({ id: t.String({ format: "uuid" }) }) })
  .delete("/staff/:id", async ({ params, set, headers, jwt }) => {
    const authHeader = headers["authorization"];
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      set.status = 401;
      return { success: false, error: "Missing or invalid authorization header" };
    }
    const token = authHeader.split(" ")[1] ?? "";
    let admin;
    try { admin = await verifyAdminToken(token, (t) => jwt.verify(t)); }
    catch { set.status = 401; return { success: false, error: "Invalid or expired session token" }; }

    try {
      await deleteStaffUser(params.id, admin.hotelId ?? undefined);
      return { success: true };
    } catch (err: any) {
      set.status = 400;
      return { success: false, error: err.message };
    }
  });
