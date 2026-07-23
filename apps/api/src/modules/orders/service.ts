/**
 * Purpose: Order Processing & Status Lifecycle Service for tableDash.
 * Responsibilities: Handles transactional order placement, status state transitions, metric aggregation for admin dashboard, SMS dispatching, and real-time WebSocket broadcasting.
 * Dependencies: Prisma database client, SMS notification service, WebSocket Hub.
 * When to modify: When adding order workflow steps, altering dashboard calculation metrics, or customizing SMS alert messages.
 */

import { prisma } from "../../../../../infrastructure/database/prisma";
import type { DashboardMetrics, OrderStatus } from "../../../../../shared/types";
import { smsService } from "../notifications/sms.service";
import { getStaffPhone } from "../settings/service";
import { wsHub } from "../websocket/hub";

export interface CreateOrderInputItem {
  productId: string;
  quantity: number;
}

export interface CreateOrderInput {
  customerName: string;
  phone: string;
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

/**
 * Places a new customer order transactionally.
 * WHY: Uses Prisma transaction to guarantee atomic execution of customer record updates, order creation, line-item pricing, and event log creation.
 */
export const placeOrder = async (input: CreateOrderInput) => {
  // Fetch requested products to calculate authoritative unit prices and totals
  const productIds = input.items.map((item) => item.productId);
  const products = await prisma.product.findMany({
    where: { id: { in: productIds } },
  });

  const productMap = new Map(products.map((p) => [p.id, p]));

  let totalAmount = 0;
  const orderItemData: OrderItemDraft[] = [];

  for (const item of input.items) {
    const product = productMap.get(item.productId);
    if (!product) {
      throw new Error(`Product with ID ${item.productId} not found`);
    }
    if (!product.available) {
      // Broadcast bounced-order alert to admins
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
      // Broadcast bounced-order alert to admins with full stock context
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

    const unitPrice = Number(product.price);
    const subtotal = unitPrice * item.quantity;
    totalAmount += subtotal;

    orderItemData.push({
      productId: product.id,
      name: product.name,
      quantity: item.quantity,
      unitPrice: unitPrice,
      subtotal: subtotal,
    });
  }

  // Execute database transaction
  const result = await prisma.$transaction(async (tx) => {
    // Find or create customer based on phone number
    let customer = await tx.customer.findFirst({
      where: { phone: input.phone },
    });

    if (!customer) {
      customer = await tx.customer.create({
        data: {
          firstName: input.customerName,
          phone: input.phone,
          marketSection: input.marketSection,
          locationDescription: input.locationDescription,
        },
      });
    } else {
      customer = await tx.customer.update({
        where: { id: customer.id },
        data: {
          firstName: input.customerName,
          marketSection: input.marketSection ?? customer.marketSection,
          locationDescription: input.locationDescription ?? customer.locationDescription,
        },
      });
    }

    // Create Order and associated line items
    const order = await tx.order.create({
      data: {
        customerId: customer.id,
        status: "NEW",
        totalAmount: totalAmount,
        marketSection: input.marketSection,
        locationDescription: input.locationDescription,
        orderItems: {
          create: orderItemData.map((item) => ({
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

    // Atomically decrement stock for each ordered product
    for (const item of orderItemData) {
      await tx.product.update({
        where: { id: item.productId },
        data: { stockQty: { decrement: item.quantity } },
      });
    }

    return order;
  });

  const formattedOrder = formatOrderResponse(result);

  // Broadcast real-time order alert to admin clients
  wsHub.broadcastToAdmins({
    type: "ORDER_CREATED",
    payload: formattedOrder,
  });

  // Dispatch SMS notification to Hotel Staff phone configured in settings
  const staffPhone = await getStaffPhone();
  if (staffPhone) {
    const itemsSummary = formattedOrder.orderItems?.map((it: any) => `${it.quantity}x ${it.name}`).join(", ") || "";
    const staffSmsMessage = `[Wambu's Corner Hotel] NEW ORDER #${formattedOrder.orderNumber} from ${input.customerName} (${input.phone}). Total: KSh ${formattedOrder.totalAmount}. Location: ${input.marketSection || "N/A"} - ${input.locationDescription || ""}. Items: ${itemsSummary}`;
    smsService.sendSms(staffPhone, staffSmsMessage).catch((err) => {
      console.error("[Staff SMS Dispatch Error]:", err);
    });
  }

  return formattedOrder;
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
 * Updates an order status and broadcasts the update via WebSockets to customer and admin.
 * Sends SMS notification to customer when status changes to OUT_FOR_DELIVERY.
 */
export const updateOrderStatus = async (id: string, newStatus: OrderStatus) => {
  const existing = await prisma.order.findUnique({ where: { id } });
  if (!existing) {
    throw new Error("Order not found");
  }

  const updated = await prisma.order.update({
    where: { id },
    data: {
      status: newStatus,
      completedAt: newStatus === "DELIVERED" ? new Date() : existing.completedAt,
    },
    include: {
      customer: true,
      orderItems: true,
    },
  });

  const formattedOrder = formatOrderResponse(updated);

  // Broadcast update via WebSocket hub
  wsHub.notifyOrderStatusUpdate(id, {
    type: "ORDER_STATUS_UPDATED",
    payload: formattedOrder,
  });

  // Dispatch SMS to customer when order is marked OUT_FOR_DELIVERY
  if (newStatus === "OUT_FOR_DELIVERY" && formattedOrder.customer?.phone) {
    const customerSmsMessage = `Hello ${formattedOrder.customer.firstName}, your order #${formattedOrder.orderNumber} from Wambu's Corner Hotel is OUT FOR DELIVERY! Our rider is on the way to your stall. Total: KSh ${formattedOrder.totalAmount}.`;
    smsService.sendSms(formattedOrder.customer.phone, customerSmsMessage).catch((err) => {
      console.error("[Customer Out-For-Delivery SMS Error]:", err);
    });
  }

  return formattedOrder;
};

/**
 * Aggregates analytical metrics for the admin dashboard.
 * Calculates total orders, delivered count, pending count, total sales volume, and top ordered items.
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
  const itemCounts: Record<string, number> = {};

  for (const order of allOrders) {
    totalSales += Number(order.totalAmount);
    if (order.status === "DELIVERED") {
      deliveredOrders++;
    } else if (order.status !== "CANCELLED") {
      pendingOrders++;
    }

    for (const item of order.orderItems) {
      itemCounts[item.name] = (itemCounts[item.name] ?? 0) + item.quantity;
    }
  }

  const topItems = Object.entries(itemCounts)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  return {
    totalOrders: allOrders.length,
    deliveredOrders,
    pendingOrders,
    totalSales,
    topItems,
  };
};

/**
 * Formats Decimal fields from Prisma models to standard TypeScript numbers for JSON serialization.
 */

function formatOrderResponse(order: any) {
  return {
    ...order,
    totalAmount: Number(order.totalAmount),
    orderItems: order.orderItems?.map((item: any) => ({
      ...item,
      unitPrice: Number(item.unitPrice),
      subtotal: Number(item.subtotal),
    })),
  };
}
