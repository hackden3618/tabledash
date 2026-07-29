import { Elysia, t } from "elysia";
import { prisma } from "../../../../../infrastructure/database/prisma";
import { env } from "../../../../../shared/config";
import { getAllHotels } from "./service";

export const hotelsRoute = new Elysia({
  prefix: `${env.apiPrefix}/hotels`,
  detail: {
    summary: "Public hotel and food discovery endpoints",
    tags: ["Hotels"],
  },
})
  .get("/", async ({ set }) => {
    try {
      const hotels = await getAllHotels();
      const data = await Promise.all(
        hotels.map(async (h) => {
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
  })
  .get(
    "/search",
    async ({ query, set }) => {
      const q = (query.q as string)?.trim();
      if (!q || q.length < 1) {
        set.status = 400;
        return { success: false, error: "Search query is required" };
      }
      try {
        const queryLower = q.toLowerCase();
        const hotels = await getAllHotels();
        const openHotels = hotels.filter((h) => h.isOpen);

        const products = await prisma.product.findMany({
          where: {
            hotelId: { in: openHotels.map((h) => h.id) },
            deleted: false,
            available: true,
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { category: { contains: q, mode: "insensitive" } },
            ],
          },
          include: { hotel: true },
          take: 50,
        });

        const results = products.map((p) => ({
          id: p.id,
          name: p.name,
          hotelId: p.hotelId || "",
          hotelName: p.hotel?.name ?? "Unknown",
          hotelSlug: p.hotel?.slug ?? "",
          hotelIsOpen: p.hotel?.isOpen ?? true,
          hotelImageUrl: p.hotel?.imageUrl ?? null,
          category: p.category,
          imageUrl: p.imageUrl,
          price: Number(p.price),
          available: p.available,
          stockQty: p.stockQty,
          relevance: p.name.toLowerCase().includes(queryLower) ? 3 : p.category.toLowerCase().includes(queryLower) ? 2 : 1,
        }));

        results.sort((a, b) => b.relevance - a.relevance);

        return { success: true, data: results, query: q };
      } catch (err: any) {
        set.status = 500;
        return { success: false, error: "Search failed" };
      }
    },
    {
      query: t.Object({
        q: t.String(),
      }),
    }
  );
