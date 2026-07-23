/**
 * Purpose: REST API endpoints for Application Settings Management.
 * Responsibilities: Exposes GET and PATCH endpoints for reading/updating settings like hotel staff phone and hotel open/closed status with auto-close time.
 * Dependencies: Elysia, shared/config.ts, settings service.
 * When to modify: When adding new settings endpoints or changing route parameters.
 */

import { Elysia, t } from "elysia";
import { env } from "../../../../../shared/config";
import {
  getHotelIsOpen,
  getStaffPhone,
  updateHotelIsOpen,
  updateStaffPhone,
  getStaffUsers,
  addStaffUser,
  updateStaffUser,
  deleteStaffUser,
} from "./service";

export const settingsRoute = new Elysia({
  prefix: `${env.apiPrefix}/settings`,
  detail: {
    summary: "Application settings management endpoints",
    tags: ["Settings"],
  },
})
  .get("/", async () => {
    const staffPhone = await getStaffPhone();
    const status = await getHotelIsOpen();
    return {
      success: true,
      data: {
        staffPhone,
        hotelIsOpen: status.isOpen,
        autoCloseAt: status.autoCloseAt,
      },
    };
  })
  .patch(
    "/",
    async ({ body, set }) => {
      try {
        let staffPhone = await getStaffPhone();
        let status = await getHotelIsOpen();

        if (body.staffPhone !== undefined) {
          staffPhone = await updateStaffPhone(body.staffPhone);
        }

        if (body.hotelIsOpen !== undefined) {
          status = await updateHotelIsOpen(body.hotelIsOpen, body.autoCloseAt);
        }

        return {
          success: true,
          data: {
            staffPhone,
            hotelIsOpen: status.isOpen,
            autoCloseAt: status.autoCloseAt,
          },
        };
      } catch (err: any) {
        set.status = 400;
        return { success: false, error: err.message };
      }
    },
    {
      body: t.Object({
        staffPhone: t.Optional(t.String({ minLength: 10, maxLength: 14, pattern: "^\\+?\\d{10,13}$" })),
        hotelIsOpen: t.Optional(t.Boolean()),
        autoCloseAt: t.Optional(t.Nullable(t.String())),
      }),
    }
  )
  .get("/staff", async () => {
    const staff = await getStaffUsers();
    return { success: true, data: staff };
  })
  .post(
    "/staff",
    async ({ body, set }) => {
      try {
        const created = await addStaffUser(body);
        return { success: true, data: created };
      } catch (err: any) {
        set.status = 400;
        return { success: false, error: err.message };
      }
    },
    {
      body: t.Object({
        name: t.String({ minLength: 2 }),
        phone: t.String({ minLength: 10, maxLength: 14, pattern: "^\\+?\\d{10,13}$" }),
        receiveSms: t.Boolean(),
      }),
    }
  )
  .patch(
    "/staff/:id",
    async ({ params, body, set }) => {
      try {
        const updated = await updateStaffUser(params.id, body);
        return { success: true, data: updated };
      } catch (err: any) {
        set.status = 400;
        return { success: false, error: err.message };
      }
    },
    {
      body: t.Object({
        name: t.Optional(t.String({ minLength: 2 })),
        phone: t.Optional(t.String({ minLength: 10, maxLength: 14, pattern: "^\\+?\\d{10,13}$" })),
        receiveSms: t.Optional(t.Boolean()),
      }),
    }
  )
  .delete("/staff/:id", async ({ params, set }) => {
    try {
      await deleteStaffUser(params.id);
      return { success: true };
    } catch (err: any) {
      set.status = 400;
      return { success: false, error: err.message };
    }
  });
