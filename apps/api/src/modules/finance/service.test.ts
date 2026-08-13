import { describe, expect, test, mock } from "bun:test";

// ── In-memory ledger that mirrors the real transaction behaviour ──
interface LedgerRow {
  id: string;
  hotelId: string;
  orderId: string;
  type: string;
  paymentMethod: string;
  amount: number;
  note?: string | null;
}

const seedAccount = { totalOwed: 150, totalPaid: 0 };
const seedOrder = {
  id: "order-X",
  orderNumber: 42,
  hotelId: "hotel-A",
  customerId: "cust-1",
  totalAmount: 150,
  amountPaid: 0,
  paymentStatus: "UNPAID",
};

let ledgerRows: LedgerRow[] = [];
let outboxRows: { eventName: string; hotelId: string; payload: string }[] = [];
let currentAccount = { ...seedAccount };

function buildTx() {
  return {
    salesRecord: {
      create: (args: any) => {
        const row: LedgerRow = { id: `sr-${ledgerRows.length + 1}`, ...args.data };
        ledgerRows.push(row);
        return Promise.resolve({ ...row });
      },
      findMany: (args: any) =>
        Promise.resolve(ledgerRows.filter((r) => r.orderId === args.where.orderId).map((r) => ({ ...r }))),
    },
    customerAccount: {
      findUnique: () => Promise.resolve({ ...currentAccount }),
      create: (args: any) => {
        currentAccount = { totalOwed: Number(args.data.totalOwed), totalPaid: Number(args.data.totalPaid) };
        return Promise.resolve({ ...currentAccount });
      },
      update: (data: any) => {
        currentAccount = {
          totalOwed: Number(data.data.totalOwed),
          totalPaid: Number(data.data.totalPaid),
        };
        return Promise.resolve({ ...currentAccount });
      },
      upsert: (data: any) => {
        currentAccount = {
          totalOwed: Number(currentAccount.totalOwed) + Number(data.update.totalOwed.increment ?? 0),
          totalPaid: Number(currentAccount.totalPaid) + Number(data.update.totalPaid.increment ?? 0),
        };
        return Promise.resolve({ ...currentAccount });
      },
    },
    order: {
      findUniqueOrThrow: () =>
        Promise.resolve({
          ...seedOrder,
          totalAmount: Number(seedOrder.totalAmount),
          customer: { id: "cust-1" },
          orderItems: [],
        }),
      update: (data: any) =>
        Promise.resolve({
          ...seedOrder,
          amountPaid: Number(data.data.amountPaid),
          paymentStatus: data.data.paymentStatus,
          customer: { id: "cust-1" },
          orderItems: [],
        }),
    },
    eventOutbox: {
      create: (args: any) => {
        outboxRows.push({ eventName: args.data.eventName, hotelId: args.data.hotelId, payload: args.data.payload });
        return Promise.resolve({ id: `out-${outboxRows.length}` });
      },
    },
  };
}

const mockOrderFindUnique = mock(() => Promise.resolve({ ...seedOrder }));
const mockTransaction = mock((fn: (tx: any) => any) => Promise.resolve(fn(buildTx())));
const mockBroadcast = mock(() => {});
const mockBroadcastToIdentities = mock(() => {});

const mockPrisma = {
  order: { findUnique: mockOrderFindUnique },
  $transaction: mockTransaction,
} as any;

mock.module("../../../../../infrastructure/database/prisma", () => ({
  prisma: mockPrisma,
}));

mock.module("../websocket/hub", () => ({
  wsHub: { broadcastToHotelAdmins: mockBroadcast, broadcastToIdentities: mockBroadcastToIdentities },
}));

function resetState() {
  ledgerRows = [];
  outboxRows = [];
  currentAccount = { ...seedAccount };
  mockOrderFindUnique.mockClear();
  mockTransaction.mockClear();
  mockBroadcast.mockClear();
  mockBroadcastToIdentities.mockClear();
}

describe("Finance service — ledger invariants", () => {
  test("recordPayment writes ORDER_PAYMENT, updates the account and outbox atomically", async () => {
    resetState();
    // Every real order carries an ORDER_CHARGE; seed it so the read-through
    // cache recomputes off a complete ledger.
    ledgerRows = [{ id: "sr-c0", hotelId: "hotel-A", orderId: "order-X", type: "ORDER_CHARGE", paymentMethod: "CREDIT", amount: 150, note: null }];
    const { recordPayment } = await import("./service");

    const result = await recordPayment("hotel-A", "cust-1", "order-X", "CASH", 100, "admin-1");

    // ORDER_PAYMENT row written with the actual method
    const payment = ledgerRows.find((r) => r.type === "ORDER_PAYMENT");
    expect(payment?.paymentMethod).toBe("CASH");
    expect(payment?.amount).toBe(100);

    // Incremental cache updated in the same transaction
    expect(currentAccount.totalPaid).toBe(100);
    expect(currentAccount.totalOwed).toBe(150);

    // Read-through cache recomputed from the ledger
    expect(result.order.amountPaid).toBe(100);
    expect(result.order.paymentStatus).toBe("PARTIAL");

    // Outbox event written for guaranteed SMS/notification dispatch
    const outbox = outboxRows.find((r) => r.eventName === "customer_account_payment_recorded");
    expect(outbox).toBeTruthy();
    const payload = JSON.parse(outbox!.payload);
    expect(payload.orderNumber).toBe(42);
    expect(payload.amount).toBe(100);
    expect(payload.balance).toBe(50);

    // Live-refresh broadcast fired
    expect(mockBroadcast.mock.calls.length).toBeGreaterThan(0);
  });

  test("a full payment flips the cache to PAID", async () => {
    resetState();
    ledgerRows = [{ id: "sr-c0", hotelId: "hotel-A", orderId: "order-X", type: "ORDER_CHARGE", paymentMethod: "CREDIT", amount: 150, note: null }];
    const { recordPayment } = await import("./service");

    const result = await recordPayment("hotel-A", "cust-1", "order-X", "MPESA", 150, "admin-1");
    expect(result.order.amountPaid).toBe(150);
    expect(result.order.paymentStatus).toBe("PAID");
  });

  test("a split cash and M-PESA payment writes one ledger row per tender atomically", async () => {
    resetState();
    ledgerRows = [{ id: "sr-c0", hotelId: "hotel-A", orderId: "order-X", type: "ORDER_CHARGE", paymentMethod: "CREDIT", amount: 150, note: null }];
    const { recordPayments } = await import("./service");

    const result = await recordPayments("hotel-A", "cust-1", "order-X", [
      { method: "CASH", amount: 50 },
      { method: "MPESA", amount: 100 },
    ], "admin-1");

    expect(ledgerRows.filter((row) => row.type === "ORDER_PAYMENT")).toEqual([
      expect.objectContaining({ paymentMethod: "CASH", amount: 50 }),
      expect.objectContaining({ paymentMethod: "MPESA", amount: 100 }),
    ]);
    expect(currentAccount.totalPaid).toBe(150);
    expect(result.order.paymentStatus).toBe("PAID");
    expect(outboxRows.filter((row) => row.eventName === "customer_account_payment_recorded")).toHaveLength(2);
  });

  test("recordPayment rejects cross-tenant orders", async () => {
    resetState();
    mockOrderFindUnique.mockResolvedValueOnce({ ...seedOrder, hotelId: "hotel-B" });
    const { recordPayment } = await import("./service");

    await expect(recordPayment("hotel-A", "cust-1", "order-X", "CASH", 100)).rejects.toThrow(
      "Order not found in this hotel"
    );
  });

  test("recordRefund requires a reason and writes a negative REFUND row", async () => {
    resetState();
    ledgerRows = [{ id: "sr-c0", hotelId: "hotel-A", orderId: "order-X", type: "ORDER_CHARGE", paymentMethod: "CREDIT", amount: 150, note: null }];
    const { recordRefund } = await import("./service");

    await expect(recordRefund("hotel-A", "cust-1", "order-X", 50, "   ")).rejects.toThrow(
      "A reason is required for a refund"
    );

    const result = await recordRefund("hotel-A", "cust-1", "order-X", 50, "Customer overpaid", "admin-1");
    const refund = ledgerRows.find((r) => r.type === "REFUND");
    expect(refund?.amount).toBe(-50);
    // With the order's charge still on the ledger (150) and a 50 refund + 50
    // residual reversal, the residual charge is what the customer still owes.
    expect(result.order.paymentStatus).toBe("UNPAID");
    const outbox = outboxRows.find((r) => r.eventName === "customer_account_refund_recorded");
    expect(outbox).toBeTruthy();
  });

  test("recordRefund on a cancelled order reverses the residual charge on the ledger", async () => {
    resetState();
    const { recordRefund } = await import("./service");

    // A cancelled, fully-paid order: charge + payment already on the ledger.
    ledgerRows = [
      { id: "sr-c1", hotelId: "hotel-A", orderId: "order-X", type: "ORDER_CHARGE", paymentMethod: "CREDIT", amount: 25, note: null },
      { id: "sr-c2", hotelId: "hotel-A", orderId: "order-X", type: "ORDER_PAYMENT", paymentMethod: "CASH", amount: 25, note: null },
      { id: "sr-c3", hotelId: "hotel-A", orderId: "order-X", type: "ADJUSTMENT", paymentMethod: "CREDIT", amount: -25, note: "Order cancelled" },
    ];
    currentAccount = { totalOwed: 0, totalPaid: 25 };
    mockOrderFindUnique.mockResolvedValueOnce({
      ...seedOrder,
      totalAmount: 25,
      amountPaid: 25,
      paymentStatus: "PAID",
      status: "CANCELLED",
    } as any);

    await recordRefund("hotel-A", "cust-1", "order-X", 25, "Order cancelled but prepaid", "admin-1");

    // The paid side is refunded and the existing charge reversal is not
    // duplicated — the ledger fully explains the settled account.
    const refund = ledgerRows.find((r) => r.type === "REFUND");
    expect(refund?.amount).toBe(-25);
    const reversals = ledgerRows.filter((r) => r.type === "ADJUSTMENT" && r.note === "Order cancelled");
    expect(reversals).toHaveLength(1);
    expect(currentAccount.totalOwed).toBe(0);
    expect(currentAccount.totalPaid).toBe(0);
  });

  test("recordAdjustment requires a non-zero amount and a reason", async () => {
    resetState();
    const { recordAdjustment } = await import("./service");

    await expect(recordAdjustment("hotel-A", "cust-1", "order-X", 0, "reason")).rejects.toThrow(
      "Adjustment amount cannot be zero"
    );
    await expect(recordAdjustment("hotel-A", "cust-1", "order-X", 10, "")).rejects.toThrow(
      "A reason is required for an adjustment"
    );

    await recordAdjustment("hotel-A", "cust-1", "order-X", 20, "Forgiven loyalty credit", "admin-1");
    const adj = ledgerRows.find((r) => r.type === "ADJUSTMENT");
    expect(adj?.amount).toBe(20);
    const outbox = outboxRows.find((r) => r.eventName === "customer_account_adjusted");
    expect(outbox).toBeTruthy();
  });

  test("a credit adjustment larger than the outstanding balance is not clamped away", async () => {
    resetState();
    const { recordAdjustment } = await import("./service");

    ledgerRows = [
      { id: "sr-c0", hotelId: "hotel-A", orderId: "order-X", type: "ORDER_CHARGE", paymentMethod: "CREDIT", amount: 150, note: null },
    ];
    currentAccount = { totalOwed: 150, totalPaid: 0 };

    await recordAdjustment("hotel-A", "cust-1", "order-X", -200, "Goodwill credit for poor service", "admin-1");

    // The ledger records the full reversal...
    const adjSum = ledgerRows
      .filter((r) => r.type === "ADJUSTMENT")
      .reduce((sum, r) => sum + Number(r.amount), 0);
    expect(adjSum).toBe(-200);
    // ...and the cache mirrors it exactly instead of flooring at zero.
    expect(currentAccount.totalOwed).toBe(-50);
    expect(currentAccount.totalPaid).toBe(0);
  });

  test("an adjustment that clears the charge flips the order to settled (PAID)", async () => {
    resetState();
    const { recordAdjustment } = await import("./service");

    ledgerRows = [
      { id: "sr-c0", hotelId: "hotel-A", orderId: "order-X", type: "ORDER_CHARGE", paymentMethod: "CREDIT", amount: 150, note: null },
    ];
    currentAccount = { totalOwed: 150, totalPaid: 0 };

    const result = await recordAdjustment("hotel-A", "cust-1", "order-X", -150, "Bill corrected to zero", "admin-1");

    expect(result.order.paymentStatus).toBe("PAID");
    expect(result.order.amountPaid).toBe(0);
    expect(currentAccount.totalOwed).toBe(0);
  });

  test("a positive adjustment on a fully paid order leaves the customer owing the difference", async () => {
    resetState();
    const { recordAdjustment } = await import("./service");

    ledgerRows = [
      { id: "sr-c0", hotelId: "hotel-A", orderId: "order-X", type: "ORDER_CHARGE", paymentMethod: "CREDIT", amount: 150, note: null },
      { id: "sr-p1", hotelId: "hotel-A", orderId: "order-X", type: "ORDER_PAYMENT", paymentMethod: "MPESA", amount: 150, note: null },
    ];
    currentAccount = { totalOwed: 150, totalPaid: 150 };

    const result = await recordAdjustment("hotel-A", "cust-1", "order-X", 50, "Under-billed — adding the difference", "admin-1");

    expect(result.order.paymentStatus).toBe("PARTIAL");
    expect(currentAccount.totalOwed).toBe(200);
  });
});
