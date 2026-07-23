/**
 * Purpose: REST API endpoints for Customer Management & History.
 * Responsibilities: Handles GET /api/v1/customers and GET /api/v1/customers/:id/orders endpoints.
 * Dependencies: Elysia, shared/config.ts, shared/schemas.ts, customer service.
 * When to modify: When adding new customer endpoints or altering route parameters.
 */

import { Elysia } from "elysia";
import { env } from "../../../../../shared/config";
import { IdParamSchema } from "../../../../../shared/schemas";
import { getAllCustomers, getCustomerHistory } from "./service";

export const customersRoute = new Elysia({
  prefix: `${env.apiPrefix}/customers`,
  detail: {
    summary: "Customer profile and order history endpoints",
    tags: ["Customers"],
  },
})
  .get("/", async () => {
    const customers = await getAllCustomers();
    return { success: true, data: customers };
  })
  .get(
    "/:id/orders",
    async ({ params, set }) => {
      try {
        const history = await getCustomerHistory(params.id);
        return { success: true, data: history };
      } catch (err: any) {
        set.status = 404;
        return { success: false, error: err.message };
      }
    },
    {
      params: IdParamSchema,
    }
  );
