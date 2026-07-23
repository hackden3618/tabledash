/**
 * Purpose: REST API endpoints for Application Settings Management.
 * Responsibilities: Exposes GET and PATCH endpoints for reading/updating settings like hotel staff phone and hotel open/closed status with auto-close time.
 * Dependencies: Elysia, shared/config.ts, settings service.
 * When to modify: When adding new settings endpoints or changing route parameters.
 */

import { Elysia, t } from "elysia";
import { env } from "../../../../../shared/config";
import { getHotelIsOpen, getStaffPhone, updateHotelIsOpen, updateStaffPhone } from "./service";

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
        staffPhone: t.Optional(t.String()),
        hotelIsOpen: t.Optional(t.Boolean()),
        autoCloseAt: t.Optional(t.Nullable(t.String())),
      }),
    }
  );
