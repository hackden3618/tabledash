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
  getHotelDeliverySettings,
  updateHotelDeliverySettings,
} from "./service";
import { verifyAdminToken } from "../auth/service";

function requireHotelAdmin(admin: { role: string; hotelId: string | null }) {
  if (admin.role !== "HOTEL_ADMIN" || !admin.hotelId) throw new Error("Only a hotel administrator can manage staff accounts");
}

function requireHotelAccount(admin: { hotelId: string | null }): string {
  if (!admin.hotelId) throw new Error("This account is not assigned to a hotel");
  return admin.hotelId;
}

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

    // Staff contact details are operational data, not marketplace data. Do not
    // expose them through the unauthenticated hotel settings response.
    const staffPhone = adminHotelId ? await getStaffPhone() : null;
    const status = await getHotelIsOpen(adminHotelId);
    const hotelName = await getHotelName(adminHotelId);
    const hotelImageUrl = await getHotelImageUrl(adminHotelId);
    const delivery = adminHotelId ? await getHotelDeliverySettings(adminHotelId) : null;
    return {
      success: true,
      data: {
        staffPhone,
        hotelName,
        hotelImageUrl,
        hotelIsOpen: status.isOpen,
        autoCloseAt: status.autoCloseAt,
        delivery,
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
        const hotelId = requireHotelAccount(admin);
        let staffPhone = await getStaffPhone();
        let status = await getHotelIsOpen(hotelId);
        let hotelImageUrl: string | null = null;

        if (body.staffPhone !== undefined) {
          requireHotelAdmin(admin);
          staffPhone = await updateStaffPhone(body.staffPhone);
        }

        if (body.hotelIsOpen !== undefined) {
          status = await updateHotelIsOpen(body.hotelIsOpen, body.autoCloseAt, hotelId);
        }

        if (body.hotelImageUrl !== undefined) {
          requireHotelAdmin(admin);
          hotelImageUrl = await updateHotelImageUrl(body.hotelImageUrl, hotelId);
        }

        const delivery = body.genericDeliveryFee !== undefined
          ? await updateHotelDeliverySettings(hotelId, body.genericDeliveryFee, body.deliveryFees ?? [])
          : await getHotelDeliverySettings(hotelId);

        return {
          success: true,
          data: {
            staffPhone,
            hotelIsOpen: status.isOpen,
            autoCloseAt: status.autoCloseAt,
            hotelImageUrl,
            delivery,
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
        genericDeliveryFee: t.Optional(t.Number({ minimum: 0 })),
        deliveryFees: t.Optional(t.Array(t.Object({ townRegionId: t.String({ format: "uuid" }), amount: t.Number({ minimum: 0 }) }))),
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

      try { requireHotelAdmin(admin); } catch (err: any) { set.status = 403; return { success: false, error: err.message }; }

      const staff = await getStaffUsers(requireHotelAccount(admin));
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

      try { requireHotelAdmin(admin); } catch (err: any) { set.status = 403; return { success: false, error: err.message }; }

      try {
        const created = await addStaffUser(body, requireHotelAccount(admin));
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

      try { requireHotelAdmin(admin); } catch (err: any) { set.status = 403; return { success: false, error: err.message }; }

      try {
        const updated = await updateStaffUser(params.id, body, requireHotelAccount(admin));
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
      requireHotelAdmin(admin);
      const staff = await provisionStaffLogin(params.id, requireHotelAccount(admin));
      return { success: true, data: staff };
    } catch (err: any) { set.status = err.message?.includes("Only a hotel administrator") ? 403 : 400; return { success: false, error: err.message || "Unable to provision staff login" }; }
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

    try { requireHotelAdmin(admin); } catch (err: any) { set.status = 403; return { success: false, error: err.message }; }

    try {
      await deleteStaffUser(params.id, requireHotelAccount(admin));
      return { success: true };
    } catch (err: any) {
      set.status = 400;
      return { success: false, error: err.message };
    }
  });
