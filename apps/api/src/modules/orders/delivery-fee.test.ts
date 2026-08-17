import { describe, expect, test, mock } from "bun:test";

/**
 * Tests for the single delivery-fee source of truth (resolveDeliveryFee) and
 * the quote layer behind both the cart and checkout fee previews
 * (getDeliveryFeeQuote). Both customer surfaces call the SAME endpoint
 * (GET /orders/delivery-fees), so the guarantee that the number shown in the
 * cart equals the number shown at checkout — and then charged at placement —
 * collapses into: getDeliveryFeeQuote must return exactly resolveDeliveryFee
 * for each hotel, deterministically.
 */

const HOTELS = [
  {
    id: "hotel-1",
    townRegionId: "zone-home",
    genericDeliveryFee: "50",
    deliveryFees: [
      { townRegionId: "zone-priced", amount: "80" },
      { townRegionId: "zone-free", amount: "0" },
      { townRegionId: "zone-home", amount: "30" },
    ],
  },
  {
    id: "hotel-2",
    townRegionId: "zone-b-home",
    genericDeliveryFee: "75",
    deliveryFees: [],
  },
];

const mockPrisma = {
  hotel: {
    findMany: async ({ where = {} }: any) => {
      const ids = Array.isArray(where?.id?.in) ? where.id.in : null;
      return ids ? HOTELS.filter((h) => ids.includes(h.id)) : [...HOTELS];
    },
  },
} as any;

mock.module("../../../../../infrastructure/database/prisma", () => ({ prisma: mockPrisma }));

describe("resolveDeliveryFee — precedence", () => {
  test("an explicit configured fee always wins, however the hotel set it (including KSh 0)", async () => {
    const { resolveDeliveryFee } = await import("./service");
    const hotel: any = HOTELS[0];
    expect(resolveDeliveryFee(hotel, "zone-priced")).toBe(80);
    expect(resolveDeliveryFee(hotel, "zone-free")).toBe(0);
    // An explicit row for the hotel's OWN zone outranks the free-by-default rule.
    expect(resolveDeliveryFee(hotel, "zone-home")).toBe(30);
  });

  test("the hotel's own delivery zone is free by default when not explicitly priced", async () => {
    const { resolveDeliveryFee } = await import("./service");
    const hotel: any = { townRegionId: "home", genericDeliveryFee: "50", deliveryFees: [] };
    expect(resolveDeliveryFee(hotel, "home")).toBe(0);
  });

  test("any other zone without a configured row falls back to the generic fee", async () => {
    const { resolveDeliveryFee } = await import("./service");
    const hotel: any = { townRegionId: "home", genericDeliveryFee: "50", deliveryFees: [] };
    expect(resolveDeliveryFee(hotel, "neighbourhood")).toBe(50);
    // No zone supplied at all (customer hasn't picked one) → generic fee.
    expect(resolveDeliveryFee(hotel, undefined)).toBe(50);
  });

  test("decimal amounts are coerced to numbers", async () => {
    const { resolveDeliveryFee } = await import("./service");
    const hotel: any = { townRegionId: "home", genericDeliveryFee: "49.5", deliveryFees: [{ townRegionId: "x", amount: "12.25" }] };
    expect(resolveDeliveryFee(hotel, "x")).toBe(12.25);
    expect(resolveDeliveryFee(hotel, "anything-else")).toBe(49.5);
  });
});

describe("getDeliveryFeeQuote — cart and checkout must quote identical amounts", () => {
  test("returns exactly resolveDeliveryFee per hotel, deterministically and order-independently", async () => {
    const { getDeliveryFeeQuote, resolveDeliveryFee } = await import("./service");
    const hotelIds = ["hotel-1", "hotel-2"];
    const zoneId = "zone-priced";

    const first = await getDeliveryFeeQuote(hotelIds, zoneId);
    const second = await getDeliveryFeeQuote([...hotelIds].reverse(), zoneId);

    expect(first).toEqual([
      { hotelId: "hotel-1", deliveryFee: 80 },
      { hotelId: "hotel-2", deliveryFee: 75 },
    ]);
    expect(second).toEqual(first);
    expect(first[0]!.deliveryFee).toBe(resolveDeliveryFee(HOTELS[0] as any, zoneId));
    expect(first[1]!.deliveryFee).toBe(resolveDeliveryFee(HOTELS[1] as any, zoneId));
  });

  test("the quoted amount equals the fee charged at order placement (same zone id)", async () => {
    // Order placement (POST /orders) reads deliveryFees via getDeliveryFeeQuote
    // with the order's deliveryZoneId — the same function the fee endpoint
    // serves to the cart and checkout pages. Same input ⇒ same number.
    const { getDeliveryFeeQuote } = await import("./service");
    const deliveryZoneId = "zone-b-home"; // hotel-2's own zone → free
    const quote = await getDeliveryFeeQuote(["hotel-2"], deliveryZoneId);
    expect(quote).toEqual([{ hotelId: "hotel-2", deliveryFee: 0 }]);
  });

  test("deduplicates repeated hotel ids", async () => {
    const { getDeliveryFeeQuote } = await import("./service");
    const quote = await getDeliveryFeeQuote(["hotel-1", "hotel-1", "hotel-2"], "zone-b-home");
    expect(quote).toEqual([
      { hotelId: "hotel-1", deliveryFee: 50 },
      { hotelId: "hotel-2", deliveryFee: 0 },
    ]);
  });

  test("throws when any requested hotel is unavailable", async () => {
    const { getDeliveryFeeQuote } = await import("./service");
    await expect(getDeliveryFeeQuote(["hotel-1", "does-not-exist"], "zone-priced")).rejects.toThrow("unavailable");
  });
});