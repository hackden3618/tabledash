/**
 * Purpose: Customer Data & Order History Service for tableDash.
 * Responsibilities: Provides functions to retrieve customer profiles and historical orders.
 * Dependencies: Prisma database client.
 * When to modify: When extending customer profile data fields or history filters.
 */

import { prisma } from "../../../../../infrastructure/database/prisma";

/**
 * Retrieves all registered customer records.
 */
export const getAllCustomers = async () => {
  return await prisma.customer.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      _count: {
        select: { orders: true },
      },
    },
  });
};

/**
 * Retrieves customer details and order history by Customer ID.
 */
export const getCustomerHistory = async (customerId: string) => {
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    include: {
      orders: {
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
