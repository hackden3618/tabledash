import { describe, expect, test } from "bun:test";
import { calculateDashboardMetrics, normalizeOrderItems } from "./logic";

describe("order logic", () => {
  test("aggregates duplicate product lines", () => {
    expect(normalizeOrderItems([
      { productId: "coffee", quantity: 2 },
      { productId: "coffee", quantity: 3 },
      { productId: "cake", quantity: 1 },
    ])).toEqual([
      { productId: "coffee", quantity: 5 },
      { productId: "cake", quantity: 1 },
    ]);
  });

  test("rejects invalid quantities", () => {
    expect(() => normalizeOrderItems([{ productId: "coffee", quantity: 0 }])).toThrow();
    expect(() => normalizeOrderItems([{ productId: "coffee", quantity: 1.5 }])).toThrow();
  });

  test("excludes cancelled orders from revenue and top items", () => {
    const metrics = calculateDashboardMetrics([
      { status: "NEW", totalAmount: 100, amountPaid: 40, paymentStatus: "PARTIAL", orderItems: [{ name: "Tea", quantity: 2 }] },
      { status: "DELIVERED", totalAmount: 50, amountPaid: 50, paymentStatus: "PAID", orderItems: [{ name: "Tea", quantity: 1 }] },
      { status: "CANCELLED", totalAmount: 999, amountPaid: 20, paymentStatus: "PARTIAL", orderItems: [{ name: "Tea", quantity: 99 }] },
    ]);

    expect(metrics.totalSales).toBe(150);
    expect(metrics.pendingOrders).toBe(1);
    expect(metrics.cancelledOrders).toBe(1);
    expect(metrics.outstandingBalance).toBe(60);
    expect(metrics.refundsDue).toBe(20);
    expect(metrics.topItems).toEqual([{ name: "Tea", count: 3 }]);
  });

  test("nets refunded amounts out of revenue", () => {
    const metrics = calculateDashboardMetrics([
      { status: "DELIVERED", totalAmount: 100, amountPaid: 100, paymentStatus: "PAID", orderItems: [{ name: "Tea", quantity: 1 }], refundedAmount: 30 },
      { status: "DELIVERED", totalAmount: 50, amountPaid: 50, paymentStatus: "PAID", orderItems: [{ name: "Tea", quantity: 1 }], refundedAmount: 50 },
    ]);

    expect(metrics.totalSales).toBe(70);
    expect(metrics.refundsProcessed).toBe(0);
  });
});
