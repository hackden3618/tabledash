/**
 * Purpose: Order Processing & Status Lifecycle Service for tableDash.
 * Responsibilities: Handles transactional order placement, status state transitions, metric aggregation for admin dashboard, SMS dispatching, and real-time WebSocket broadcasting.
 * Dependencies: Prisma database client, SMS notification service, WebSocket Hub.
 * When to modify: When adding order workflow steps, altering dashboard calculation metrics, or customizing SMS alert messages.
 */

import { prisma } from "../../../../../infrastructure/database/prisma";
import type { DashboardMetrics, OrderStatus, PaymentStatus } from "../../../../../shared/types";
import { smsService } from "../notifications/sms.service";
import { getDefaultHotel } from "../hotels/service";
import { getHotelIsOpen, getSmsRecipients } from "../settings/service";
import { wsHub } from "../websocket/hub";
import { formatPhone } from "../../../../../shared/phone";

export interface CreateOrderInputItem {
  productId: string;
  quantity: number;
}

export interface CreateOrderInput {
  customerName: string;
  phone: string;
  stallNumber?: string;
  marketSection?: string;
  locationDescription?: string;
  items: CreateOrderInputItem[];
}

interface OrderItemDraft {
  productId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
}

const PENDING_STATUSES: OrderStatus[] = [
  "NEW",
  "ACCEPTED",
  "PREPARING",
  "READY_FOR_DELIVERY",
  "OUT_FOR_DELIVERY",
];

/**
 * Places a new customer order transactionally.
 * Groups items by product.hotelId, creates one Order per hotel atomically.
 * WHY: Supports multi-hotel cart — items from different hotels are partitioned
 * into separate orders within a single transaction. All orders share one customer.
 */
export const placeOrder = async (input: CreateOrderInput) => {
  // Check if at least one hotel is open
  const hotelStatus = await getHotelIsOpen();
  if (!hotelStatus.isOpen) {
    const hotelName = (await getDefaultHotel())?.name ?? "TableDash Deliveries";
    throw new Error(`${hotelName} is currently closed for new orders. Please check back later!`);
  }
  // Fetch requested products to calculate authoritative unit prices and totals
  const productIds = input.items.map((item) => item.productId);
  const products = await prisma.product.findMany({
    where: { id: { in: productIds } },
    include: { hotel: true },
  });

  const productMap = new Map(products.map((p) => [p.id, p]));

  // Validate all items are available and in stock
  for (const item of input.items) {
    const product = productMap.get(item.productId);
    if (!product) {
      throw new Error(`Product with ID ${item.productId} not found`);
    }
    if (!product.available) {
      wsHub.broadcastOrderBounced({
        type: "ORDER_BOUNCED",
        payload: {
          reason: "unavailable",
          productName: product.name,
          customerPhone: input.phone,
          customerName: input.customerName,
          requestedQty: item.quantity,
        },
      });
      throw new Error(`"${product.name}" is currently unavailable`);
    }
    if (product.stockQty < item.quantity) {
      wsHub.broadcastOrderBounced({
        type: "ORDER_BOUNCED",
        payload: {
          reason: "out_of_stock",
          productName: product.name,
          customerPhone: input.phone,
          customerName: input.customerName,
          requestedQty: item.quantity,
          availableQty: product.stockQty,
        },
      });
      throw new Error(
        `Only ${product.stockQty} portion(s) of "${product.name}" left in stock (you requested ${item.quantity})`
      );
    }
  }

  // Group items by hotelId
  const hotelGroups = new Map<string, { hotelId: string; hotelName: string; items: typeof input.items; orderItemData: OrderItemDraft[]; totalAmount: number }>();
  for (const item of input.items) {
    const product = productMap.get(item.productId)!;
    const hId = product.hotelId || "default";
    if (!hotelGroups.has(hId)) {
      hotelGroups.set(hId, { hotelId: hId, hotelName: product.hotel?.name || "TableDash Deliveries", items: [], orderItemData: [], totalAmount: 0 });
    }
    const group = hotelGroups.get(hId)!;
    group.items.push(item);
    const unitPrice = Number(product.price);
    const subtotal = unitPrice * item.quantity;
    group.totalAmount += subtotal;
    group.orderItemData.push({
      productId: product.id,
      name: product.name,
      quantity: item.quantity,
      unitPrice,
      subtotal,
    });
  }

  const formattedPhone = formatPhone(input.phone);

  // Execute database transaction — one Order per hotel group
  const result = await prisma.$transaction(async (tx) => {
    let customer = await tx.customer.findFirst({
      where: { phone: formattedPhone },
    });

    if (!customer) {
      customer = await tx.customer.create({
        data: {
          firstName: input.customerName,
          phone: formattedPhone,
          stallNumber: input.stallNumber,
          marketSection: input.marketSection,
          locationDescription: input.locationDescription,
        },
      });
    } else {
      customer = await tx.customer.update({
        where: { id: customer.id },
        data: {
          firstName: input.customerName,
          stallNumber: input.stallNumber ?? customer.stallNumber,
          marketSection: input.marketSection ?? customer.marketSection,
          locationDescription: input.locationDescription ?? customer.locationDescription,
        },
      });
    }

    // Decrement stock once per product (deduplicated across groups)
    const updatedProducts: any[] = [];
    const seenProductIds = new Set<string>();
    for (const [, group] of hotelGroups) {
      for (const item of group.orderItemData) {
        if (seenProductIds.has(item.productId)) continue;
        seenProductIds.add(item.productId);
        const updated = await tx.product.update({
          where: { id: item.productId },
          data: { stockQty: { decrement: item.quantity } },
        });
        if (updated.stockQty <= 0) {
          const markedUnavailable = await tx.product.update({
            where: { id: item.productId },
            data: { available: false, stockQty: Math.max(0, updated.stockQty), outOfStockSince: new Date() },
          });
          updatedProducts.push(markedUnavailable);
        } else {
          updatedProducts.push(updated);
        }
      }
    }

    // Create one Order per hotel group
    const orders: any[] = [];
    const outboxIds: string[] = [];
    for (const [, group] of hotelGroups) {
      const order = await tx.order.create({
        data: {
          customerId: customer.id,
          status: "NEW",
          totalAmount: group.totalAmount,
          stallNumber: input.stallNumber,
          marketSection: input.marketSection,
          locationDescription: input.locationDescription,
          hotelId: group.hotelId === "default" ? undefined : group.hotelId,
          orderItems: {
            create: group.orderItemData.map((item) => ({
              productId: item.productId,
              name: item.name,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              subtotal: item.subtotal,
            })),
          },
        },
        include: {
          customer: true,
          orderItems: true,
        },
      });

      const itemsSummary = group.orderItemData.map((it) => `${it.quantity}x ${it.name}`).join(", ");
      const outbox = await tx.eventOutbox.create({
        data: {
          eventName: "order_created",
          payload: JSON.stringify({
            orderId: order.id,
            orderNumber: order.orderNumber,
            customerName: input.customerName,
            customerPhone: formattedPhone,
            totalAmount: group.totalAmount,
            itemsSummary,
            marketSection: input.marketSection,
            locationDescription: input.locationDescription,
            hotelId: group.hotelId === "default" ? undefined : group.hotelId,
            hotelName: group.hotelName,
          }),
          status: "initialized",
        },
      });

      orders.push(order);
      outboxIds.push(outbox.id);
    }

    return { orders, updatedProducts, outboxIds };
  });

  const formattedOrders = result.orders.map(formatOrderResponse);

  // Broadcast menu updates
  for (const prod of result.updatedProducts) {
    wsHub.broadcastMenuUpdate({
      type: "MENU_AVAILABILITY_UPDATED",
      payload: {
        ...prod,
        price: Number(prod.price),
      },
    });
  }

  // Broadcast each order to admins
  const staffPhones = await getSmsRecipients();
  for (let i = 0; i < result.orders.length; i++) {
    const order = result.orders[i]!;
    const formattedOrder = formattedOrders[i]!;
    const group = Array.from(hotelGroups.values())[i]!;

    wsHub.broadcastToAdmins({
      type: "ORDER_CREATED",
      payload: formattedOrder,
    });

    if (staffPhones.length > 0) {
      const itemsSummary = formattedOrder.orderItems?.map((it: any) => `${it.quantity}x ${it.name}`).join(", ") || "";
      const msg = `[${group.hotelName}] NEW ORDER #${formattedOrder.orderNumber} from ${input.customerName} (${input.phone}). Total: KSh ${formattedOrder.totalAmount}. Location: ${input.marketSection || "N/A"} - ${input.locationDescription || ""}. Items: ${itemsSummary}`;

      Promise.all(
        staffPhones.map((phone) =>
          smsService.sendSms(phone, msg).catch(() => false)
        )
      ).then((results) => {
        const allSent = results.every((r) => r !== false);
        if (allSent && result.outboxIds[i]) {
          prisma.eventOutbox.update({
            where: { id: result.outboxIds[i]! },
            data: { status: "done", completedAt: new Date() },
          }).catch(() => {});
        }
      }).catch(() => {});
    } else if (result.outboxIds[i]) {
      prisma.eventOutbox.update({
        where: { id: result.outboxIds[i]! },
        data: { status: "done", completedAt: new Date() },
      }).catch(() => {});
    }
  }

  // Return first order for backward compatibility with single-order consumers.
  // Multi-order responses will be surfaced via the checkout concept in a future phase.
  return formattedOrders.length === 1 ? formattedOrders[0]! : formattedOrders;
};

/**
 * Retrieves all orders with optional status filter.
 */
export const getOrders = async (statusFilter?: OrderStatus) => {
  const orders = await prisma.order.findMany({
    where: statusFilter ? { status: statusFilter } : undefined,
    include: {
      customer: true,
      orderItems: true,
    },
    orderBy: { orderedAt: "desc" },
  });

  return orders.map(formatOrderResponse);
};

/**
 * Retrieves a single order by ID.
 */
export const getOrderById = async (id: string) => {
  const order = await prisma.order.findUnique({
    where: { id },
    include: {
      customer: true,
      orderItems: true,
    },
  });

  if (!order) {
    throw new Error("Order not found");
  }

  return formatOrderResponse(order);
};

/**
 * Canonical forward-only order status pipeline.
 * WHY: Orders must always progress forward. Lower rank = earlier stage.
 * CANCELLED is treated as a terminal exit from any non-terminal state.
 */
const STATUS_RANK: Record<string, number> = {
  NEW:                1,
  ACCEPTED:           2,
  PREPARING:          3,
  READY_FOR_DELIVERY: 4,
  OUT_FOR_DELIVERY:   5,
  DELIVERED:          6,
  CANCELLED:          99,
};

/**
 * Restores product stock from a cancelled order.
 * This uses a distinct code path that does NOT touch freshness timestamps
 * (lastRestockedAt / outOfStockSince), since cancellation is not a real restock.
 */
async function restoreStockFromCancellation(tx: any, orderItems: any[]) {
  for (const item of orderItems) {
    const product = await tx.product.findUnique({ where: { id: item.productId } });
    const newStockQty = product.stockQty + item.quantity;

    await tx.product.update({
      where: { id: item.productId },
      data: {
        stockQty: newStockQty,
        available: newStockQty > 0 ? true : product.available,
      },
    });
  }
}

/**
 * Updates an order status and broadcasts the update via WebSockets to customer and admin.
 * Sends SMS notification to customer when status changes to OUT_FOR_DELIVERY.
 * Enforces forward-only progression: an order can never be reverted to a previous status.
 * On CANCELLED, atomically restores stock quantities via restoreStockFromCancellation.
 */
export const updateOrderStatus = async (id: string, newStatus: OrderStatus, cancelReason?: string) => {
  const hotel = await getDefaultHotel();
  const hotelName = hotel?.name ?? "TableDash Deliveries";
  const existing = await prisma.order.findUnique({
    where: { id },
    include: { orderItems: true },
  });
  if (!existing) {
    throw new Error("Order not found");
  }

  const currentRank = STATUS_RANK[existing.status] ?? 0;
  const newRank     = STATUS_RANK[newStatus]       ?? 0;

  if (newStatus !== "CANCELLED" && newRank <= currentRank) {
    throw new Error(
      `Cannot move order from "${existing.status}" back to "${newStatus}". Status can only advance forward.`
    );
  }

  if (existing.status === "DELIVERED" || existing.status === "CANCELLED") {
    throw new Error(
      `Order is already "${existing.status}" and cannot be changed further.`
    );
  }

  const updated = await prisma.$transaction(async (tx) => {
    if (newStatus === "CANCELLED") {
      await restoreStockFromCancellation(tx, existing.orderItems);
    }

    const updateData: any = {
      status: newStatus,
      completedAt: newStatus === "DELIVERED" ? new Date() : existing.completedAt,
      cancelReason: newStatus === "CANCELLED" ? (cancelReason || "Staff unavailable to deliver at this time") : existing.cancelReason,
    };

    if (newStatus === "CANCELLED") {
      updateData.cancelledAtStatus = existing.status;
    }

    const updatedOrder = await tx.order.update({
      where: { id },
      data: updateData,
      include: {
        customer: true,
        orderItems: true,
      },
    });

    const outbox = await tx.eventOutbox.create({
      data: {
        eventName: "order_status_updated",
        payload: JSON.stringify({
          orderId: updatedOrder.id,
          orderNumber: updatedOrder.orderNumber,
          customerName: updatedOrder.customer.firstName,
          customerPhone: updatedOrder.customer.phone,
          totalAmount: Number(updatedOrder.totalAmount),
          newStatus,
          hotelName,
          cancelReason: newStatus === "CANCELLED" ? (cancelReason || "Staff unavailable to deliver at this time") : undefined,
        }),
        status: "initialized",
      },
    });

    return { updatedOrder, outboxId: outbox.id };
  });

  const formattedOrder = formatOrderResponse(updated.updatedOrder);

  if (newStatus === "CANCELLED") {
    for (const item of existing.orderItems) {
      const prod = await prisma.product.findUnique({ where: { id: item.productId } });
      if (prod) {
        wsHub.broadcastMenuUpdate({
          type: "MENU_AVAILABILITY_UPDATED",
          payload: { ...prod, price: Number(prod.price) },
        });
      }
    }
  }

  wsHub.notifyOrderStatusUpdate(id, {
    type: "ORDER_STATUS_UPDATED",
    payload: formattedOrder,
  });

  if (newStatus === "OUT_FOR_DELIVERY") {
    wsHub.broadcastNotification({
      type: "NOTIFICATION",
      payload: {
        category: "dispatch",
        title: "🚀 Order Dispatched",
        message: `Order #${formattedOrder.orderNumber} is out for delivery!`,
        orderId: id,
      },
    });
  }

  if (newStatus === "CANCELLED") {
    wsHub.broadcastNotification({
      type: "NOTIFICATION",
      payload: {
        category: "cancellation",
        title: "⚠️ Order Cancelled",
        message: `Order #${formattedOrder.orderNumber} has been cancelled. Reason: ${cancelReason || "N/A"}`,
        orderId: id,
      },
    });
  }

  if (newStatus === "OUT_FOR_DELIVERY" && formattedOrder.customer?.phone) {
    const customerSmsMessage = `Hello ${formattedOrder.customer.firstName}, your order #${formattedOrder.orderNumber} from ${hotelName} is OUT FOR DELIVERY! Be ready to receive your delivery at your stall. Our rider is on the way. Total: KSh ${formattedOrder.totalAmount}.`;
    (async () => {
      try {
        await smsService.sendSms(formattedOrder.customer.phone, customerSmsMessage);
        if (updated.outboxId) {
          await prisma.eventOutbox.update({
            where: { id: updated.outboxId },
            data: { status: "done", completedAt: new Date() },
          });
        }
      } catch (err) {
        console.error("[Customer Out-For-Delivery SMS Error]:", err);
      }
    })();
  }

  if (newStatus === "CANCELLED" && formattedOrder.customer?.phone) {
    const reasonStr = cancelReason || "we are unable to deliver your order at this time";
    const customerSmsMessage = `Hello ${formattedOrder.customer.firstName}, we are sorry to inform you that order #${formattedOrder.orderNumber} from ${hotelName} has been cancelled. Reason: ${reasonStr}. We appreciate your understanding. Track your orders: https://tabledash.up.railway.app`;
    (async () => {
      try {
        await smsService.sendSms(formattedOrder.customer.phone, customerSmsMessage);
      } catch (err) {
        console.error("[Customer Cancel SMS Error]:", err);
      }
    })();
  }

  // Staff abort SMS — notify staff when an order is cancelled (customer-initiated or admin-initiated)
  if (newStatus === "CANCELLED") {
    const staffPhones = await getSmsRecipients().catch(() => []);
    if (staffPhones.length > 0) {
      const cancelSource = (cancelReason || "").toLowerCase().includes("customer") ? "Customer cancelled" : "Order cancelled";
      const staffAbortMessage = `[${hotelName}] ABORT: Order #${formattedOrder.orderNumber} has been CANCELLED. Reason: ${cancelReason || "Staff unavailable"}. No delivery needed.`;
      Promise.all(
        staffPhones.map((phone) =>
          smsService.sendSms(phone, staffAbortMessage).catch(() => false)
        )
      ).catch(() => {});
    }
  }

  return formattedOrder;
};

/**
 * Cancels an order by the customer themselves.
 * Validates the order belongs to the customer before cancelling.
 */
export const cancelOrderByCustomer = async (id: string, customerId: string, reason?: string) => {
  const order = await prisma.order.findUnique({
    where: { id },
    include: { orderItems: true },
  });
  if (!order) {
    throw new Error("Order not found");
  }
  if (order.customerId !== customerId) {
    throw new Error("This order does not belong to you");
  }
  if (order.status === "DELIVERED" || order.status === "CANCELLED") {
    throw new Error(`Order is already "${order.status}" and cannot be cancelled`);
  }
  if (order.status === "OUT_FOR_DELIVERY") {
    throw new Error("Order is already out for delivery and cannot be cancelled. Please contact the hotel directly.");
  }

  return updateOrderStatus(id, "CANCELLED", reason || "Cancelled by customer");
};

/**
 * Updates payment status and amount paid for an order.
 * When marked PAID, auto-sets amountPaid = totalAmount.
 * When marked UNPAID, sets amountPaid = 0.
 * Broadcasts ORDER_PAYMENT_UPDATED via WS and writes outbox event.
 */
export const updateOrderPayment = async (id: string, data: { paymentStatus?: PaymentStatus; amountPaid?: number }) => {
  const existing = await prisma.order.findUnique({
    where: { id },
    include: { customer: true, orderItems: true },
  });
  if (!existing) {
    throw new Error("Order not found");
  }

  const total = Number(existing.totalAmount);
  let paymentStatus = data.paymentStatus ?? existing.paymentStatus;
  let amountPaid = data.amountPaid ?? Number(existing.amountPaid);

  if (data.paymentStatus === "PAID") {
    amountPaid = total;
  } else if (data.paymentStatus === "UNPAID") {
    amountPaid = 0;
  }

  const updated = await prisma.order.update({
    where: { id },
    data: { paymentStatus, amountPaid },
    include: { customer: true, orderItems: true },
  });

  const formatted = formatOrderResponse(updated);

  wsHub.broadcastNotification({
    type: "ORDER_PAYMENT_UPDATED",
    payload: {
      ...formatted,
      paymentStatus,
      amountPaid,
    },
  });

  const hotel = await getDefaultHotel();
  const hotelName = hotel?.name ?? "TableDash Deliveries";

  (async () => {
    try {
      const outbox = await prisma.eventOutbox.create({
        data: {
          eventName: "order_payment_updated",
          payload: JSON.stringify({
            orderId: updated.id,
            orderNumber: updated.orderNumber,
            customerName: updated.customer.firstName,
            customerPhone: updated.customer.phone,
            paymentStatus,
            amountPaid,
            totalAmount: total,
            hotelName,
          }),
          status: "done",
          completedAt: new Date(),
        },
      });

      if (updated.customer?.phone && paymentStatus !== "UNPAID") {
        const msg = `Hello ${updated.customer.firstName}, payment for order #${updated.orderNumber} from ${hotelName} has been updated to ${paymentStatus === "PAID" ? "PAID ✅" : "PARTIAL"} (KSh ${amountPaid}/KSh ${total}). Thank you!`;
        await smsService.sendSms(updated.customer.phone, msg);
        await prisma.eventOutbox.update({
          where: { id: outbox.id },
          data: { status: "done", completedAt: new Date() },
        });
      }
    } catch (err) {
      console.error("[Payment Update SMS Error]:", err);
    }
  })();

  return formatted;
};

/**
 * Retrieves orders for a specific date with payment info surfaced.
 */
export const getDailyOrders = async (dateStr: string) => {
  const startDate = new Date(dateStr + "T00:00:00.000Z");
  const endDate = new Date(dateStr + "T23:59:59.999Z");

  const orders = await prisma.order.findMany({
    where: {
      orderedAt: {
        gte: startDate,
        lte: endDate,
      },
    },
    include: {
      customer: true,
      orderItems: true,
    },
    orderBy: { orderedAt: "desc" },
  });

  return orders.map(formatOrderResponse);
};

/**
 * Aggregates analytical metrics for the admin dashboard.
 * Revenue excludes cancelled orders; pending uses an explicit allow-list.
 */
export const getDashboardMetrics = async (): Promise<DashboardMetrics> => {
  const allOrders = await prisma.order.findMany({
    include: {
      orderItems: true,
    },
  });

  let totalSales = 0;
  let deliveredOrders = 0;
  let pendingOrders = 0;
  let cancelledOrders = 0;
  const itemCounts: Record<string, number> = {};

  for (const order of allOrders) {
    if (order.status !== "CANCELLED") {
      totalSales += Number(order.totalAmount);
    }

    if (order.status === "DELIVERED") {
      deliveredOrders++;
    } else if ((PENDING_STATUSES as string[]).includes(order.status)) {
      pendingOrders++;
    }

    if (order.status === "CANCELLED") {
      cancelledOrders++;
    }

    for (const item of order.orderItems) {
      itemCounts[item.name] = (itemCounts[item.name] ?? 0) + item.quantity;
    }
  }

  const nonCancelledCount = allOrders.length - cancelledOrders;
  const outstandingBalance = allOrders
    .filter((o) => o.paymentStatus !== "PAID" && o.status !== "CANCELLED")
    .reduce((sum, o) => sum + (Number(o.totalAmount) - Number(o.amountPaid)), 0);

  const topItems = Object.entries(itemCounts)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  return {
    totalOrders: allOrders.length,
    deliveredOrders,
    pendingOrders,
    cancelledOrders,
    totalSales,
    outstandingBalance,
    averageOrderValue: nonCancelledCount > 0 ? totalSales / nonCancelledCount : 0,
    topItems,
  };
};

function formatOrderResponse(order: any) {
  return {
    ...order,
    totalAmount: Number(order.totalAmount),
    amountPaid: Number(order.amountPaid),
    orderItems: order.orderItems?.map((item: any) => ({
      ...item,
      unitPrice: Number(item.unitPrice),
      subtotal: Number(item.subtotal),
    })),
  };
}
