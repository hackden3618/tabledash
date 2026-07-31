import { describe, expect, test, mock } from "bun:test";

const mockOrderFindFirst = mock(() => Promise.resolve(null));
const mockOrderFindMany = mock(() => Promise.resolve([]));
const mockOrderUpdate = mock(() => Promise.resolve(null));
const mockUpdateMany = mock(() => Promise.resolve({ count: 1 }));
const mockHotelFindUnique = mock(() => Promise.resolve({ id: "hotel-A", name: "Test Hotel" }));
const mockTransaction = mock(() => Promise.resolve({ count: 1 }));

const mockPrisma = {
  order: { findFirst: mockOrderFindFirst, findMany: mockOrderFindMany, update: mockOrderUpdate, updateMany: mockUpdateMany },
  hotel: { findUnique: mockHotelFindUnique },
  $transaction: mockTransaction,
  eventOutbox: { update: mock(() => Promise.resolve({})) },
  product: { findUnique: mock(() => Promise.resolve({ stockQty: 10 })) },
} as any;

mock.module("../../../../../infrastructure/database/prisma", () => ({
  prisma: mockPrisma,
}));

async function resetMocks() {
  mockOrderFindFirst.mockClear();
  mockOrderFindMany.mockClear();
  mockOrderUpdate.mockClear();
  mockHotelFindUnique.mockClear();
  mockTransaction.mockClear();
  mockOrderFindFirst.mockResolvedValue(null);
  mockOrderFindMany.mockResolvedValue([]);
}

describe("Order service tenant isolation", () => {
  test("getOrderById scopes queries by hotelId", async () => {
    await resetMocks();
    mockOrderFindFirst.mockResolvedValueOnce(null);

    const service = await import("./service");
    await expect(service.getOrderById("order-X", "hotel-A")).rejects.toThrow("Order not found");
    const allCalls = mockOrderFindFirst.mock.calls as any[][];
    expect(allCalls.length).toBeGreaterThan(0);
    const lastCall = allCalls[allCalls.length - 1]!;
    expect(lastCall[0].where.hotelId).toBe("hotel-A");
  });

  test("getOrderById does not include hotelId when omitted", async () => {
    await resetMocks();
    mockOrderFindFirst.mockResolvedValueOnce({
      id: "order-X",
      hotelId: "hotel-A",
      status: "NEW",
      orderItems: [],
      customerId: null,
      hotelIdValue: null,
      totalAmount: 0,
      amountPaid: 0,
      paymentStatus: "PENDING" as any,
      deliveryAddress: null,
      deliveryLatitude: null,
      deliveryLongitude: null,
      driverId: null,
      driverFirstName: null,
      driverLastName: null,
      driverPhone: null,
      driverLocationLatitude: null,
      driverLocationLongitude: null,
      driverLocationTimestamp: null,
      cancelReason: null,
      cancelledAtStatus: null,
      cancelledAt: null,
      completedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any);

    const service = await import("./service");
    await service.getOrderById("order-X", undefined);
    const allCalls = mockOrderFindFirst.mock.calls as any[][];
    expect(allCalls.length).toBeGreaterThan(0);
    const lastCall = allCalls[allCalls.length - 1]!;
    expect(lastCall[0].where).toEqual({ id: "order-X" });
  });

  test("updateOrderStatus rejects cross-tenant access", async () => {
    await resetMocks();
    mockOrderFindFirst.mockResolvedValueOnce({
      id: "order-X",
      hotelId: "hotel-B",
      status: "NEW",
      orderItems: [],
      cancelledAtStatus: null,
      cancelledAt: null,
      completedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any);

    const service = await import("./service");
    await expect(service.updateOrderStatus("order-X", "PREPARING", undefined, "hotel-A")).rejects.toThrow("Order does not belong to your hotel");
  });

  test("getPendingCollection scopes to the hotel and only returns DELIVERED with open items", async () => {
    await resetMocks();
    mockOrderFindMany.mockResolvedValueOnce([]);

    const service = await import("./service");
    await service.getPendingCollection("hotel-A");

    const call = (mockOrderFindMany.mock.calls as any[][])[0]![0] as any;
    expect(call.where.hotelId).toBe("hotel-A");
    expect(call.where.status).toBe("DELIVERED");
    // Payment and utensils resolve independently — either keeps the row on the list
    expect(call.where.OR).toEqual([
      { paymentStatus: { not: "PAID" } },
      { utensilsIssued: true, utensilsReturnedAt: null },
    ]);
  });

  test("markUtensilsReturned scopes the order lookup by hotelId", async () => {
    await resetMocks();

    const service = await import("./service");
    // A cross-tenant order is never found, because the lookup is scoped by hotelId.
    await expect(service.markUtensilsReturned("order-X", "hotel-A", "admin-1")).rejects.toThrow("Order not found");

    const call = (mockOrderFindFirst.mock.calls as any[][]).at(-1)![0] as any;
    expect(call.where).toEqual({ id: "order-X", hotelId: "hotel-A" });
    // The update must never run for an order the staff member cannot see.
    expect(mockOrderUpdate.mock.calls.length).toBe(0);
  });
});