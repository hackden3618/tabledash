/**
 * Purpose: Customer Data & Order History Service for tableDash.
 * Responsibilities: Provides functions to retrieve customer profiles and historical orders.
 * Dependencies: Prisma database client.
 * When to modify: When extending customer profile data fields or history filters.
 */

import { prisma } from "../../../../../infrastructure/database/prisma";

/**
 * Retrieves registered customer records, optionally scoped to a hotel.
 * When hotelId is provided, only customers with orders belonging to that hotel are returned.
 */
export const getAllCustomers = async (hotelId?: string) => {
  if (!hotelId) {
    return await prisma.customer.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        _count: {
          select: { orders: true },
        },
      },
    });
  }

  const orderIds = await prisma.order.findMany({
    where: { hotelId },
    select: { customerId: true },
  });

  const customerIds = [...new Set(orderIds.map((o) => o.customerId))];

  return await prisma.customer.findMany({
    where: { id: { in: customerIds } },
    orderBy: { createdAt: "desc" },
    include: {
      _count: {
        select: { orders: true },
      },
    },
  });
};

/**
 * Retrieves customer details and order history by Customer ID,
 * optionally scoped to a single hotel.
 */
export const getCustomerHistory = async (customerId: string, hotelId?: string) => {
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    include: {
      orders: {
        where: hotelId ? { hotelId } : undefined,
        include: {
          orderItems: true,
        },
        orderBy: { orderedAt: "desc" },
      },
    },
  });

    if (!customer) {
        throw new Error("Customer record not found");
    }

    return {
        ...customer,
        orders: customer.orders.map((order) => ({
            ...order,
            totalAmount: Number(order.totalAmount),
            orderItems: order.orderItems.map((item) => ({
                ...item,
                unitPrice: Number(item.unitPrice),
                subtotal: Number(item.subtotal),
            })),
        })),
    };
};
