import { describe, expect, test, mock } from "bun:test";

// On-behalf orders must not be attributed to a number whose owner never
// confirmed it: placeOrder must reject orderingForOther when the recipient's
// number has no recent OTP verification, before any order/ledger write.

const recipient = {
  id: "cust-recipient",
  accountId: "LD-CUST-000998",
  firstName: "Ben",
  lastName: null,
  knownName: null,
  phone: "254700000002",
  verifiedAt: null,
  recipientVerifiedAt: null,
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
    findFirst: () => Promise.resolve({ ...recipient }),
    update: (args: any) => Promise.resolve({ ...recipient, ...args.data }),
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

describe("On-behalf recipient verification gate", () => {
  test("orderingForOther with an unverified recipient is rejected before any order write", async () => {
    mockTransaction.mockClear();

    const service = await import("./service");
    await expect(
      service.placeOrder({
        firstName: "Ben",
        phone: "0700000002",
        items: [{ productId: "prod-1", quantity: 1 }],
        orderingForOther: true,
      })
    ).rejects.toThrow(/recipient.*verify/i);

    const calls = (mockTransaction.mock.calls as any[][]).map((c) => c[0]);
    const createdOrders = calls.filter((c) => c.order?.create);
    expect(createdOrders.length).toBe(0);
  });
});
