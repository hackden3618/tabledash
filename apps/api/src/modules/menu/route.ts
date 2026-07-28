/**
 * Purpose: REST API endpoints for Menu & Product Management.
 * Responsibilities: Exposes GET, POST, PATCH, and DELETE endpoints for menu items.
 * Dependencies: Elysia, shared/config.ts, shared/schemas.ts, menu service.
 * When to modify: When adding new menu endpoints or changing routing parameters.
 */

import { jwt } from "@elysiajs/jwt";
import { Elysia, t } from "elysia";
import { env } from "../../../../../shared/config";
import {
  CreateProductSchema,
  IdParamSchema,
  UpdateProductAvailabilitySchema,
  UpdateProductStockSchema,
} from "../../../../../shared/schemas";
import {
  createMenuItem,
  deleteMenuItem,
  getAllMenuItems,
  updateProductAvailability,
  updateProductStock,
} from "./service";
import { verifyAdminToken } from "../auth/service";

export const menuRoute = new Elysia({
  prefix: `${env.apiPrefix}/menu`,
  detail: {
    summary: "Menu and product catalog management endpoints",
    tags: ["Menu"],
  },
})
  .use(
    jwt({
      name: "jwt",
      secret: env.jwtSecret,
    })
  )
  .get(
    "/",
    async ({ query, set }) => {
      try {
        const hotelId = (query as any).hotelId as string | undefined;
        const items = await getAllMenuItems(hotelId);
        return { success: true, data: items };
      } catch (err: any) {
        set.status = 500;
        return { success: false, error: "Failed to load menu items" };
      }
    }
  )
  .post(
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
        const product = await createMenuItem(body, admin.hotelId ?? undefined);
        set.status = 201;
        return { success: true, data: product };
      } catch (err: any) {
        set.status = 400;
        return { success: false, error: err.message };
      }
    },
    { body: CreateProductSchema }
  )
  .patch(
    "/:id/availability",
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
        const updated = await updateProductAvailability(params.id, body.available, admin.hotelId ?? undefined);
        return { success: true, data: updated };
      } catch (err: any) {
        set.status = 400;
        return { success: false, error: err.message };
      }
    },
    { params: IdParamSchema, body: UpdateProductAvailabilitySchema }
  )
  .patch(
    "/:id/stock",
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
        const updated = await updateProductStock(params.id, body.stockQty, admin.hotelId ?? undefined);
        return { success: true, data: updated };
      } catch (err: any) {
        set.status = 400;
        return { success: false, error: err.message };
      }
    },
    { params: IdParamSchema, body: UpdateProductStockSchema }
  )
  .delete(
    "/:id",
    async ({ params, set, headers, jwt }) => {
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
        await deleteMenuItem(params.id, admin.hotelId ?? undefined);
        return { success: true, message: "Product deleted successfully" };
      } catch (err: any) {
        set.status = 400;
        return { success: false, error: err.message };
      }
    },
    { params: IdParamSchema }
  );
