/**
 * Purpose: Customer Data & Order History Service for ladha.
 * Responsibilities: Provides functions to retrieve customer profiles and historical orders.
 * Dependencies: Prisma database client.
 * When to modify: When extending customer profile data fields or history filters.
 */

import { prisma } from "../../../../../infrastructure/database/prisma";
import { formatPhone } from "../../../../../shared/phone";

/**
 * Looks up a customer by phone for the "ordering on behalf of someone else"
 * flow. Returns only public display fields — the account ID, display name and
 * verification status — never the phone used to look up, or any sensitive data.
 * Not-found is a normal answer (a guest), not an error.
 */
export const lookupCustomerByPhone = async (phone: string) => {
  const customer = await prisma.customer.findUnique({
    where: { phone: formatPhone(phone) },
    select: { id: true, accountId: true, firstName: true, lastName: true, knownName: true, verifiedAt: true, pinHash: true },
  });

  if (!customer) return { found: false };

  return {
    found: true,
    customer: {
      id: customer.id,
      accountId: customer.accountId,
      firstName: customer.firstName,
      lastName: customer.lastName,
      knownName: customer.knownName,
      isVerified: Boolean(customer.verifiedAt),
      hasPin: Boolean(customer.pinHash),
    },
  };
};

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
