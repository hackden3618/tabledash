import { Elysia, t } from "elysia";
import { prisma } from "../../../../../infrastructure/database/prisma";
import { env } from "../../../../../shared/config";
import { getAllHotels } from "./service";

const normalize = (value: string) => value.toLowerCase().normalize("NFKD").replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();

const levenshtein = (left: string, right: string) => {
  if (left === right) return 0;
  if (!left.length) return right.length;
  if (!right.length) return left.length;
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i += 1) {
    let diagonal = previous[0]!;
    previous[0] = i;
    for (let j = 1; j <= right.length; j += 1) {
      const above = previous[j]!;
      previous[j] = left[i - 1] === right[j - 1]
        ? diagonal
        : Math.min(previous[j - 1]! + 1, above + 1, diagonal + 1);
      diagonal = above;
    }
  }
  return previous[right.length]!;
};

const fuzzyScore = (query: string, value: string) => {
  const q = normalize(query);
  const text = normalize(value);
  if (!q || !text) return 0;
  const tokens = text.split(" ");
  let score = 0;
  if (text === q) score += 100;
  if (text.startsWith(q)) score += 45;
  if (text.includes(q)) score += 30;
  for (const token of q.split(" ")) {
    if (!token) continue;
    if (tokens.some((candidate) => candidate === token)) score += 25;
    else if (tokens.some((candidate) => candidate.startsWith(token))) score += 16;
    else if (tokens.some((candidate) => candidate.includes(token))) score += 10;
    else if (tokens.some((candidate) => levenshtein(token, candidate) <= Math.max(1, Math.floor(token.length / 3)))) score += 7;
  }
  return score;
};

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
        const hotels = await getAllHotels();
        const hotelIds = hotels.map((h) => h.id);

        const products = await prisma.product.findMany({
          where: {
            hotelId: { in: hotelIds },
            deleted: false,
          },
          include: { hotel: true },
        });

        const results = products.map((p) => {
          const hotel = p.hotel;
          const productScore = fuzzyScore(q, p.name) * 3 + fuzzyScore(q, p.category) * 2;
          const hotelScore = hotel ? fuzzyScore(q, hotel.name) : 0;
          return {
          id: p.id,
          name: p.name,
          hotelId: p.hotelId || "",
          hotelName: hotel?.name ?? "Unknown",
          hotelSlug: hotel?.slug ?? "",
          hotelIsOpen: hotel?.isOpen ?? true,
          hotelImageUrl: hotel?.imageUrl ?? null,
          category: p.category,
          imageUrl: p.imageUrl,
          price: Number(p.price),
          available: p.available,
          stockQty: p.stockQty,
          relevance: productScore + hotelScore,
          };
        }).filter((result) => result.relevance > 0)
          .sort((a, b) => b.relevance - a.relevance)
          .slice(0, 100);

        const groups = hotels
          .map((hotel) => {
            const items = results.filter((result) => result.hotelId === hotel.id);
            const hotelRelevance = fuzzyScore(q, hotel.name);
            if (!items.length && hotelRelevance < 7) return null;
            return {
              hotel: {
                id: hotel.id,
                name: hotel.name,
                slug: hotel.slug,
                imageUrl: hotel.imageUrl,
                isOpen: hotel.isOpen,
              },
              relevance: Math.max(hotelRelevance, items[0]?.relevance ?? 0),
              items,
            };
          })
          .filter((group): group is NonNullable<typeof group> => Boolean(group))
          .sort((a, b) => b.relevance - a.relevance);

        return { success: true, data: { results, groups }, query: q };
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
