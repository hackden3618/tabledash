/**
 * Purpose: REST API endpoints for Application Settings Management.
 * Responsibilities: Exposes GET and PATCH endpoints for reading/updating settings like hotel staff phone.
 * Dependencies: Elysia, shared/config.ts, settings service.
 * When to modify: When adding new settings endpoints or changing route parameters.
 */

import { Elysia, t } from "elysia";
import { env } from "../../../../../shared/config";
import { getStaffPhone, updateStaffPhone } from "./service";

export const settingsRoute = new Elysia({
  prefix: `${env.apiPrefix}/settings`,
  detail: {
    summary: "Application settings management endpoints",
    tags: ["Settings"],
  },
})
  .get("/", async () => {
    const staffPhone = await getStaffPhone();
    return { success: true, data: { staffPhone } };
  })
  .patch(
    "/",
    async ({ body, set }) => {
      try {
        const staffPhone = await updateStaffPhone(body.staffPhone);
        return { success: true, data: { staffPhone } };
      } catch (err: any) {
        set.status = 400;
        return { success: false, error: err.message };
      }
    },
    {
      body: t.Object({
        staffPhone: t.String({ minLength: 9, error: "Valid staff phone number is required" }),
      }),
    }
  );
