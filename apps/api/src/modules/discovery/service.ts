import { prisma } from "../../../../../infrastructure/database/prisma";
import { toPublicMediaUrl } from "../media/service";

let homeCache: { expiresAt: number; data: Awaited<ReturnType<typeof buildHomeDiscovery>> } | null = null;

const getHotelRatings = async () => {
  try {
    return await prisma.restaurantReview.groupBy({ by: ["hotelId"], _avg: { rating: true }, _count: { _all: true } });
  } catch {
    return [] as { hotelId: string; _avg: { rating: number | null }; _count: { _all: number } }[];
  }
};

const getMealRatings = async () => {
  try {
    return await prisma.productReview.groupBy({ by: ["productId"], _avg: { rating: true }, _count: { _all: true } });
  } catch {
    return [] as { productId: string; _avg: { rating: number | null }; _count: { _all: number } }[];
  }
};

const formatProduct = (product: { id: string; name: string; category: string; mealCategories: string[]; imageUrl: string; price: unknown; available: boolean; stockQty: number; hotelId: string; hotel: { id: string; name: string; imageUrl: string | null; isOpen: boolean; zone: { id: string; name: string; type: string }; townRegion: { name: string } } }, salesCount: number, recentSalesCount: number, rating: number | null, ratingCount: number) => ({
  id: product.id,
  name: product.name,
  category: product.category,
  mealCategories: product.mealCategories,
  imageUrl: toPublicMediaUrl(product.imageUrl) ?? product.imageUrl,
  price: Number(product.price),
  available: product.available,
  stockQty: product.stockQty,
  hotelId: product.hotelId,
  hotelName: product.hotel.name,
  hotelImageUrl: product.hotel.imageUrl ? (toPublicMediaUrl(product.hotel.imageUrl) ?? product.hotel.imageUrl) : null,
  hotelIsOpen: product.hotel.isOpen,
  locationName: `${product.hotel.townRegion.name}, ${product.hotel.zone.name}`,
  salesCount,
  recentSalesCount,
  rating,
  ratingCount,
});

const buildHomeDiscovery = async (zoneId?: string, customerId?: string) => {
  const [hotels, products, paidItems, heroSetting, ratingRows, mealRatingRows, recentOrders] = await Promise.all([
    prisma.hotel.findMany({ where: { deletedAt: null, isListed: true, ...(zoneId ? { zoneId } : {}) }, select: { id: true, name: true, slug: true, imageUrl: true, isOpen: true, townRegion: { select: { name: true } }, zone: { select: { id: true, name: true, type: true, megaRegion: { select: { id: true, name: true, type: true } } } } }, orderBy: { name: "asc" } }),
    prisma.product.findMany({
      where: {
        deleted: false, available: true, stockQty: { gt: 0 },
        // A hidden or deleted hotel must be invisible everywhere, not just
        // in the restaurant list — otherwise its items keep surfacing in
        // Popular/Trending/Recently Ordered, which defeats the point of
        // hiding it and confuses a customer who taps through to a listing
        // that then can't be found in the marketplace at all.
        hotel: { isListed: true, deletedAt: null, ...(zoneId ? { zoneId } : {}) },
      },
      include: { hotel: { select: { id: true, name: true, imageUrl: true, isOpen: true, townRegion: { select: { name: true } }, zone: { select: { id: true, name: true, type: true, megaRegion: { select: { id: true, name: true, type: true } } } } } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.orderItem.findMany({
      where: {
        order: {
          status: "DELIVERED",
          paymentStatus: "PAID",
          salesRecords: { some: { type: "ORDER_CHARGE" } },
        },
      },
      select: { productId: true, quantity: true, order: { select: { orderedAt: true, hotelId: true } } },
    }),
    prisma.setting.findUnique({ where: { key: "platform_hero_image_url" }, select: { value: true } }),
    getHotelRatings(),
    getMealRatings(),
    customerId
      ? prisma.order.findMany({ where: { customerId, status: "DELIVERED" }, orderBy: { orderedAt: "desc" }, take: 10, select: { orderItems: { select: { productId: true } } } })
      : Promise.resolve([] as { orderItems: { productId: string }[] }[]),
  ]);

  const popularCutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const recentCutoff = Date.now() - 3 * 24 * 60 * 60 * 1000;
  const sales = new Map<string, number>();
  const recentSales = new Map<string, number>();
  const hotelSales = new Map<string, number>();
  for (const item of paidItems) {
    if (item.order.orderedAt.getTime() >= popularCutoff) {
      sales.set(item.productId, (sales.get(item.productId) ?? 0) + item.quantity);
      hotelSales.set(item.order.hotelId, (hotelSales.get(item.order.hotelId) ?? 0) + item.quantity);
    }
    if (item.order.orderedAt.getTime() >= recentCutoff) {
      recentSales.set(item.productId, (recentSales.get(item.productId) ?? 0) + item.quantity);
    }
  }

  const enriched = products.map((product) => {
    const mealRating = mealRatingRows.find((row) => row.productId === product.id);
    return formatProduct(product, sales.get(product.id) ?? 0, recentSales.get(product.id) ?? 0, mealRating?._avg.rating ?? null, mealRating?._count._all ?? 0);
  });
  const availableProducts = enriched.filter((product) => product.available && product.stockQty > 0);
  const recentProductIds = new Set(recentOrders.flatMap((order) => order.orderItems.map((item) => item.productId)));
  const recentlyOrdered = availableProducts.filter((product) => recentProductIds.has(product.id)).slice(0, 8);
  const popularMeals = [...availableProducts].filter((product) => product.salesCount > 0).sort((a, b) => b.salesCount - a.salesCount || (b.rating ?? 0) - (a.rating ?? 0)).slice(0, 8);
  const trendingMeals = [...availableProducts].filter((product) => product.recentSalesCount > 0).sort((a, b) => b.recentSalesCount - a.recentSalesCount || (b.rating ?? 0) - (a.rating ?? 0)).slice(0, 8);
  const restaurants = hotels.map((hotel) => ({
    id: hotel.id,
    name: hotel.name,
    slug: hotel.slug,
    isOpen: hotel.isOpen,
    imageUrl: hotel.imageUrl ? (toPublicMediaUrl(hotel.imageUrl) ?? hotel.imageUrl) : null,
    productCount: products.filter((product) => product.hotelId === hotel.id).length,
    completedSales: hotelSales.get(hotel.id) ?? 0,
    locationName: `${hotel.townRegion.name}, ${hotel.zone.name}`,
    locationType: hotel.zone.type,
    rating: ratingRows.find((row) => row.hotelId === hotel.id)?._avg.rating ?? null,
    ratingCount: ratingRows.find((row) => row.hotelId === hotel.id)?._count._all ?? 0,
    isLocal: true,
  })).sort((a, b) => Number(b.isLocal) - Number(a.isLocal) || Number(b.isOpen) - Number(a.isOpen) || b.completedSales - a.completedSales || (b.rating ?? 0) - (a.rating ?? 0) || a.name.localeCompare(b.name));

  return {
    greeting: "Good food, close to you.",
    hero: { title: "Taste moments that matter.", description: "Fresh meals from trusted local kitchens.", imageUrl: heroSetting?.value || null },
    restaurants,
    recommendedMeals: [],
    popularMeals,
    trendingMeals,
    recentlyOrdered,
    promotions: [],
    trustIndicators: [
      { label: "Trusted local kitchens", icon: "shield" },
      { label: "Freshly prepared", icon: "leaf" },
      { label: "Order updates", icon: "route" },
      { label: "Secure checkout", icon: "lock" },
    ],
  };
};

export const getActiveZones = async () => prisma.zone.findMany({
  where: { active: true },
  select: {
    id: true, name: true, type: true, locationLabel: true, locationPlaceholder: true,
    megaRegion: { select: { id: true, name: true, type: true } },
    deliveryRegions: { where: { active: true }, select: { id: true, name: true, isFallback: true }, orderBy: [{ isFallback: "desc" }, { name: "asc" }] },
  },
  orderBy: [{ megaRegion: { name: "asc" } }, { name: "asc" }],
});

export const getHomeDiscovery = async (zoneId?: string, _includeAll = false, customerId?: string) => {
  if (zoneId !== undefined || customerId) {
    const data = await buildHomeDiscovery(zoneId, customerId);
    return data;
  }
  if (homeCache && homeCache.expiresAt > Date.now()) return homeCache.data;
  const data = await buildHomeDiscovery();
  homeCache = { data, expiresAt: Date.now() + 30_000 };
  return data;
};
