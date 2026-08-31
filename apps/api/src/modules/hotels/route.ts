import { Elysia, t } from "elysia";
import { prisma } from "../../../../../infrastructure/database/prisma";
import { env } from "../../../../../shared/config";
import { getAllHotels } from "./service";
import { jwt } from "@elysiajs/jwt";
import { verifyCustomerToken } from "../customers/auth.service";

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
  .use(jwt({ name: "jwt", secret: env.jwtSecret }))
  /**
   * "Talk to staff on WhatsApp" contact for a hotel. Deliberately public (no
   * customer auth needed — a guest can be browsing without an account) and
   * hotel-scoped (a customer's cart can span multiple hotels; each needs its
   * own contact, never one shared number). Resolves to the earliest-created
   * HOTEL_ADMIN account for that hotel, via their linked StaffUser phone —
   * never a hardcoded fallback. Returns null if the hotel genuinely has no
   * contactable phone on file, so the frontend can hide the button rather
   * than silently messaging the wrong person.
   */
  .get(
    "/:hotelId/whatsapp-contact",
    async ({ params, set }) => {
      const admin = await prisma.adminUser.findFirst({
        where: { hotelId: params.hotelId, role: "HOTEL_ADMIN" },
        orderBy: { createdAt: "asc" },
        select: { name: true, staffProfiles: { select: { phone: true }, take: 1 } },
      });
      const phone = admin?.staffProfiles[0]?.phone ?? null;
      if (!phone) {
        set.status = 404;
        return { success: false, error: "No staff contact is configured for this hotel yet" };
      }
      return { success: true, data: { phone, name: admin?.name ?? null } };
    },
    { params: t.Object({ hotelId: t.String({ format: "uuid" }) }) }
  )
  /**
   * Public hotel listing (marketplace) — filters by isListed.
   * Used by the marketplace discovery page.
   */
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
            location: h.zone,
            locationName: `${h.townRegion.name}, ${h.zone.name}`,
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
  /**
   * Single hotel by URL slug — does NOT filter on isListed.
   * Used by QR-code direct links (/h/:slug) and hotel-page routing.
   * Hidden hotels remain reachable via their QR link so they can be
   * shared privately before going live on the marketplace.
   */
  .get("/by-slug/:slug", async ({ params, set }) => {
    try {
      const hotel = await prisma.hotel.findFirst({
        where: { slug: params.slug, deletedAt: null },
        select: {
          id: true,
          name: true,
          slug: true,
          isOpen: true,
          imageUrl: true,
          isListed: true,
          townRegion: { select: { name: true } },
          zone: { select: { id: true, name: true, type: true } },
        },
      });
      if (!hotel) {
        set.status = 404;
        return { success: false, error: "No kitchen found at this link. It may have moved or been removed." };
      }
      const products = await prisma.product.findMany({
        where: { hotelId: hotel.id, deleted: false },
        select: {
          id: true,
          name: true,
          category: true,
          mealCategories: true,
          imageUrl: true,
          price: true,
          available: true,
          stockQty: true,
        },
        orderBy: { createdAt: "asc" },
      });
      const { toPublicMediaUrl } = await import("../media/service");
      return {
        success: true,
        data: {
          hotel: {
            id: hotel.id,
            name: hotel.name,
            slug: hotel.slug,
            isOpen: hotel.isOpen,
            imageUrl: hotel.imageUrl ? (toPublicMediaUrl(hotel.imageUrl) ?? hotel.imageUrl) : null,
            locationName: `${hotel.townRegion.name}, ${hotel.zone.name}`,
            locationType: hotel.zone.type,
          },
          products: products.map((p) => ({
            id: p.id,
            name: p.name,
            category: p.category,
            mealCategories: p.mealCategories,
            imageUrl: toPublicMediaUrl(p.imageUrl) ?? p.imageUrl,
            price: Number(p.price),
            available: p.available,
            stockQty: p.stockQty,
          })),
        },
      };
    } catch {
      set.status = 500;
      return { success: false, error: "Failed to load hotel" };
    }
  }, { params: t.Object({ slug: t.String() }) })
  .get("/rating/:hotelId", async ({ params, set }) => {
    try {
      const aggregate = await prisma.restaurantReview.aggregate({
        where: { hotelId: params.hotelId },
        _avg: { rating: true },
        _count: { _all: true },
      });
      return { success: true, data: { average: aggregate._avg.rating ?? null, count: aggregate._count._all } };
    } catch {
      set.status = 500;
      return { success: false, error: "Ratings are temporarily unavailable" };
    }
  }, { params: t.Object({ hotelId: t.String({ format: "uuid" }) }) })
  .post("/rating/:hotelId", async ({ params, body, headers, jwt, set }) => {
    const authorization = headers.authorization ?? "";
    const token = authorization.replace("Bearer ", "").trim();
    const customerId = await verifyCustomerToken(token, (value) => jwt.verify(value));
    if (!customerId) { set.status = 401; return { success: false, error: "Sign in to rate a completed order" }; }
    try {
      const order = await prisma.order.findFirst({ where: { id: body.orderId, hotelId: params.hotelId, customerId, status: "DELIVERED" } });
      if (!order) throw new Error("Only your delivered orders can be rated");
      const review = await prisma.restaurantReview.create({ data: { customerId, hotelId: params.hotelId, orderId: order.id, rating: body.rating, comment: body.comment?.trim() || null } });
      return { success: true, data: review };
    } catch (err: any) {
      set.status = 400;
      return { success: false, error: err.code === "P2002" ? "This order has already been rated" : err.message };
    }
  }, {
    params: t.Object({ hotelId: t.String({ format: "uuid" }) }),
    body: t.Object({ orderId: t.String({ format: "uuid" }), rating: t.Integer({ minimum: 1, maximum: 5 }), comment: t.Optional(t.String({ maxLength: 500 })) }),
  })
  .post("/rating/:hotelId/items/:productId", async ({ params, body, headers, jwt, set }) => {
    const authorization = headers.authorization ?? "";
    const token = authorization.replace("Bearer ", "").trim();
    const customerId = await verifyCustomerToken(token, (value) => jwt.verify(value));
    if (!customerId) { set.status = 401; return { success: false, error: "Sign in to rate a completed order" }; }
    try {
      const order = await prisma.order.findFirst({ where: { id: body.orderId, hotelId: params.hotelId, customerId, status: "DELIVERED", orderItems: { some: { productId: params.productId } } } });
      if (!order) throw new Error("Only meals from your delivered order can be rated");
      const review = await prisma.productReview.create({ data: { customerId, hotelId: params.hotelId, productId: params.productId, orderId: order.id, rating: body.rating } });
      return { success: true, data: review };
    } catch (err: any) {
      set.status = 400;
      return { success: false, error: err.code === "P2002" ? "This meal has already been rated for this order" : err.message };
    }
  }, {
    params: t.Object({ hotelId: t.String({ format: "uuid" }), productId: t.String({ format: "uuid" }) }),
    body: t.Object({ orderId: t.String({ format: "uuid" }), rating: t.Integer({ minimum: 1, maximum: 5 }) }),
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
        const hotels = await getAllHotels(query.zoneId as string | undefined);
        const hotelIds = hotels.map((h) => h.id);

        const products = await prisma.product.findMany({
          where: {
            hotelId: { in: hotelIds },
            deleted: false,
          },
          include: { hotel: { select: { id: true, name: true, slug: true, imageUrl: true, isOpen: true } } },
        });

        const results = products.map((p) => {
          const hotel = p.hotel;
          const productScore = fuzzyScore(q, p.name) * 3 + fuzzyScore(q, p.category) * 2 + fuzzyScore(q, (p.mealCategories || []).join(" ")) * 3;
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
          mealCategories: p.mealCategories,
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
        zoneId: t.Optional(t.String({ format: "uuid" })),
      }),
    }
  )
  /**
   * Dynamic XML sitemap of all publicly listed hotels.
   * Submit https://ladha.co.ke/api/v1/hotels/sitemap.xml to Google Search
   * Console alongside the static /sitemap.xml so every hotel page gets indexed.
   */
  .get("/sitemap.xml", async ({ set }) => {
    try {
      const hotels = await prisma.hotel.findMany({
        where: { deletedAt: null, isListed: true },
        select: { slug: true, updatedAt: true },
        orderBy: { name: "asc" },
      });
      const baseUrl = (process.env.PUBLIC_URL ?? "https://ladha.co.ke").replace(/\/$/, "");
      const entries = hotels.map((h) =>
        `  <url>\n    <loc>${baseUrl}/h/${encodeURIComponent(h.slug)}</loc>\n    <changefreq>daily</changefreq>\n    <lastmod>${new Date(h.updatedAt).toISOString().split("T")[0]}</lastmod>\n    <priority>0.9</priority>\n  </url>`
      ).join("\n");
      const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries}\n</urlset>`;
      set.headers["Content-Type"] = "application/xml; charset=utf-8";
      set.headers["Cache-Control"] = "public, max-age=3600";
      return xml;
    } catch {
      set.status = 500;
      return { success: false, error: "Sitemap unavailable" };
    }
  });
