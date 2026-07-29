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
  UpdateProductSchema,
  UpdateProductStockSchema,
} from "../../../../../shared/schemas";
import {
  createMenuItem,
  deleteMenuItem,
  getAllMenuItems,
  updateProduct,
  updateProductAvailability,
  updateProductStock,
} from "./service";
import { verifyAdminToken } from "../auth/service";

function requireHotelAccount(admin: { hotelId: string | null }): string {
  if (!admin.hotelId) throw new Error("This account is not assigned to a hotel");
  return admin.hotelId;
}

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
    async ({ query, set, headers, jwt }) => {
      try {
        let hotelId = (query as any).hotelId as string | undefined;

        // If an admin token is present, scope to that admin's hotel
        const authHeader = headers["authorization"];
        if (authHeader && authHeader.startsWith("Bearer ")) {
          const token = authHeader.split(" ")[1] ?? "";
          try {
            const admin = await verifyAdminToken(token, (t) => jwt.verify(t));
            hotelId = admin.hotelId ?? hotelId;
          } catch {
            // Invalid token — fall through to public behavior
          }
        }

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
        const product = await createMenuItem(body, requireHotelAccount(admin));
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
        const updated = await updateProductAvailability(params.id, body.available, requireHotelAccount(admin));
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
        const updated = await updateProductStock(params.id, body.stockQty, requireHotelAccount(admin));
        return { success: true, data: updated };
      } catch (err: any) {
        set.status = 400;
        return { success: false, error: err.message };
      }
    },
    { params: IdParamSchema, body: UpdateProductStockSchema }
  )
  .patch(
    "/:id",
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
        const updated = await updateProduct(params.id, body, requireHotelAccount(admin));
        return { success: true, data: updated };
      } catch (err: any) {
        set.status = 400;
        return { success: false, error: err.message };
      }
    },
    { params: IdParamSchema, body: UpdateProductSchema }
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
        await deleteMenuItem(params.id, requireHotelAccount(admin));
        return { success: true, message: "Product deleted successfully" };
      } catch (err: any) {
        set.status = 400;
        return { success: false, error: err.message };
      }
    },
    { params: IdParamSchema }
  );
