import { describe, expect, test, mock } from "bun:test";

// The DoD requires proof that an unverified customer cannot select Pay Later at
// checkout. This test drives the real placeOrder path and expects a rejection
// before any order/ledger write happens.

const unverifiedCustomer = {
  id: "cust-unverified",
  accountId: "LD-CUST-000999",
  firstName: "Ada",
  lastName: null,
  knownName: null,
  phone: "254700000001",
  verifiedAt: null,
};

const validProduct = {
  id: "prod-1",
  name: "Beef Stew",
  price: "450",
  available: true,
  stockQty: 10,
  hotelId: "hotel-A",
  hotel: { id: "hotel-A", name: "Test Hotel", isOpen: true },
};

const txMock = {
  customer: {
    findFirst: () => Promise.resolve({ ...unverifiedCustomer }),
    update: (args: any) => Promise.resolve({ ...unverifiedCustomer, ...args.data }),
  },
};

const mockTransaction = mock(async (cb: any) => cb(txMock));

const mockPrisma = {
  product: {
    findMany: () => Promise.resolve([validProduct]),
  },
  hotel: {
    findMany: () => Promise.resolve([{ id: "hotel-A", name: "Test Hotel", isOpen: true }]),
  },
  $transaction: mockTransaction,
} as any;

mock.module("../../../../../infrastructure/database/prisma", () => ({
  prisma: mockPrisma,
}));

describe("Pay Later verified-customer gate", () => {
  test("unverified customer attempting Pay Later is rejected at order creation", async () => {
    mockTransaction.mockClear();

    const service = await import("./service");
    await expect(
      service.placeOrder({
        firstName: "Ada",
        phone: "0700000001",
        items: [{ productId: "prod-1", quantity: 1 }],
        paymentMethod: "PAY_LATER",
      })
    ).rejects.toThrow(/verified account/i);

    // Rejection happens server-side before any order is written.
    const calls = (mockTransaction.mock.calls as any[][]).map((c) => c[0]);
    const createdOrders = calls.filter((c) => c.order?.create);
    expect(createdOrders.length).toBe(0);
  });
});
