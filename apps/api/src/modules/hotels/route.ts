import { Elysia } from "elysia";
import { env } from "../../../../../shared/config";
import { getAllHotels } from "./service";

export const hotelsRoute = new Elysia({
  prefix: `${env.apiPrefix}/hotels`,
  detail: {
    summary: "Public hotel listing endpoints",
    tags: ["Hotels"],
  },
})
  .get("/", async ({ set }) => {
    try {
      const hotels = await getAllHotels();
      const data = await Promise.all(
        hotels.map(async (h) => {
          const { prisma } = await import("../../../../../infrastructure/database/prisma");
          const productCount = await prisma.product.count({
            where: { hotelId: h.id, deleted: false, available: true },
          });
          return {
            id: h.id,
            name: h.name,
            slug: h.slug,
            isOpen: h.isOpen,
            imageUrl: h.imageUrl,
            productCount,
          };
        })
      );
      return { success: true, data };
    } catch (err: any) {
      set.status = 500;
      return { success: false, error: "Failed to load hotels" };
    }
  });
