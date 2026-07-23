/**
 * Purpose: REST API endpoints for Menu & Product Management.
 * Responsibilities: Exposes GET, POST, PATCH, and DELETE endpoints for menu items.
 * Dependencies: Elysia, shared/config.ts, shared/schemas.ts, menu service.
 * When to modify: When adding new menu endpoints or changing routing parameters.
 */

import { Elysia } from "elysia";
import { env } from "../../../../../shared/config";
import {
  CreateProductSchema,
  IdParamSchema,
  UpdateProductAvailabilitySchema,
} from "../../../../../shared/schemas";
import {
  createMenuItem,
  deleteMenuItem,
  getAllMenuItems,
  updateProductAvailability,
} from "./service";

export const menuRoute = new Elysia({
  prefix: `${env.apiPrefix}menu`,
  detail: {
    summary: "Menu and product catalog management endpoints",
    tags: ["Menu"],
  },
})
  .get("/", async () => {
    const items = await getAllMenuItems();
    return { success: true, data: items };
  })
  .post(
    "/",
    async ({ body, set }) => {
      try {
        const product = await createMenuItem(body);
        set.status = 201;
        return { success: true, data: product };
      } catch (err: any) {
        set.status = 400;
        return { success: false, error: err.message };
      }
    },
    {
      body: CreateProductSchema,
    }
  )
  .patch(
    "/:id/availability",
    async ({ params, body, set }) => {
      try {
        const updated = await updateProductAvailability(params.id, body.available);
        return { success: true, data: updated };
      } catch (err: any) {
        set.status = 400;
        return { success: false, error: err.message };
      }
    },
    {
      params: IdParamSchema,
      body: UpdateProductAvailabilitySchema,
    }
  )
  .delete(
    "/:id",
    async ({ params, set }) => {
      try {
        await deleteMenuItem(params.id);
        return { success: true, message: "Product deleted successfully" };
      } catch (err: any) {
        set.status = 400;
        return { success: false, error: err.message };
      }
    },
    {
      params: IdParamSchema,
    }
  );
