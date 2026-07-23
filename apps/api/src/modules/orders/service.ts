/**
 * Purpose: Order Processing & Status Lifecycle Service for tableDash.
 * Responsibilities: Handles transactional order placement, status state transitions, metric aggregation for admin dashboard, SMS dispatching, and real-time WebSocket broadcasting.
 * Dependencies: Prisma database client, SMS notification service, WebSocket Hub.
 * When to modify: When adding order workflow steps, altering dashboard calculation metrics, or customizing SMS alert messages.
 */

import { prisma } from "../../../../../infrastructure/database/prisma";
import type { DashboardMetrics, OrderStatus } from "../../../../../shared/types";
import { smsService } from "../notifications/sms.service";
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
      throw new Error(`Product "${product.name}" is currently unavailable`);
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

    return order;
  });

  const formattedOrder = formatOrderResponse(result);

  // Broadcast real-time order alert to admin clients
  wsHub.broadcastToAdmins({
    type: "ORDER_CREATED",
    payload: formattedOrder,
  });

  // Dispatch SMS notification to customer and admin
  const smsMessage = `Order #${formattedOrder.orderNumber} received! Thank you for ordering from Mama's Hotel. We will call you shortly to confirm.`;
  smsService.sendSms(formattedOrder.customer?.phone ?? input.phone, smsMessage).catch((err) => {
    console.error("[SMS Dispatch Error]:", err);
  });

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
