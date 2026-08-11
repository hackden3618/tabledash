import type { DashboardMetrics, OrderStatus } from "../../../../../shared/types";

export interface NormalizedOrderItem {
  productId: string;
  quantity: number;
}

export function normalizeOrderItems(items: Array<{ productId: string; quantity: number }>): NormalizedOrderItem[] {
  const quantities = new Map<string, number>();
  for (const item of items) {
    if (!item.productId || !Number.isInteger(item.quantity) || item.quantity < 1) {
      throw new Error("Every order item must have a valid product and a quantity of at least 1");
    }
    quantities.set(item.productId, (quantities.get(item.productId) ?? 0) + item.quantity);
  }
  return [...quantities].map(([productId, quantity]) => ({ productId, quantity }));
}

export const PENDING_STATUSES: OrderStatus[] = [
  "NEW",
  "ACCEPTED",
  "PREPARING",
  "READY_FOR_DELIVERY",
  "OUT_FOR_DELIVERY",
];

interface MetricsOrder {
  status: OrderStatus;
  totalAmount: unknown;
  amountPaid: unknown;
  paymentStatus: string;
  orderItems: Array<{ name: string; quantity: number }>;
  /** Sum of |REFUND| sales records for this order, so revenue excludes refunded money. */
  refundedAmount?: number;
}

export function calculateDashboardMetrics(allOrders: MetricsOrder[]): DashboardMetrics {
  let totalSales = 0;
  let deliveredOrders = 0;
  let pendingOrders = 0;
  let cancelledOrders = 0;
  let refundedCount = 0;
  const itemCounts: Record<string, number> = {};

  for (const order of allOrders) {
    const isCancelled = order.status === "CANCELLED";
    if (!isCancelled) {
      totalSales += Math.max(0, Number(order.totalAmount) - (order.refundedAmount ?? 0));
      for (const item of order.orderItems) itemCounts[item.name] = (itemCounts[item.name] ?? 0) + item.quantity;
    }
    if (order.status === "DELIVERED") deliveredOrders++;
    else if (PENDING_STATUSES.includes(order.status)) pendingOrders++;
    if (isCancelled) cancelledOrders++;
    if (order.paymentStatus === "REFUNDED") refundedCount++;
  }

  const nonCancelledCount = allOrders.length - cancelledOrders;
  const outstandingBalance = allOrders
    .filter((order) => order.paymentStatus !== "PAID" && order.paymentStatus !== "REFUNDED" && order.status !== "CANCELLED")
    .reduce((sum, order) => sum + Number(order.totalAmount) - Number(order.amountPaid), 0);
  const refundsDue = allOrders
    .filter((order) => order.status === "CANCELLED" && Number(order.amountPaid) > 0 && order.paymentStatus !== "REFUNDED")
    .reduce((sum, order) => sum + Number(order.amountPaid), 0);
  const topItems = Object.entries(itemCounts)
    .map(([name, count]) => ({ name, count }))
    .sort((left, right) => right.count - left.count)
    .slice(0, 5);

  return {
    totalOrders: allOrders.length,
    deliveredOrders,
    pendingOrders,
    cancelledOrders,
    refundsProcessed: refundedCount,
    totalSales,
    outstandingBalance,
    refundsDue,
    averageOrderValue: nonCancelledCount > 0 ? totalSales / nonCancelledCount : 0,
    topItems,
  };
}
