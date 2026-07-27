/**
 * Purpose: Customer Authentication Service for tableDash.
 * Responsibilities: Handles customer self-registration, PIN verification, and profile retrieval.
 *   Login is phone + 4-digit PIN. PINs are hashed using Bun.password (Argon2id) — more secure
 *   than bcrypt and zero extra dependencies since Bun ships it natively.
 * Dependencies: Prisma client, Bun.password (built-in).
 * When to modify: When changing auth mechanism, adding email/OTP, or extending profile fields.
 */

import { prisma } from "../../../../../infrastructure/database/prisma";
import { formatPhone } from "../../../../../shared/phone";

const CUSTOMER_TOKEN_EXPIRY_SEC = 7 * 24 * 60 * 60; // 7 days

/**
 * Registers a new customer account with a 4-digit PIN.
 * If the phone already exists and has no PIN yet (guest account created during a past order),
 * we attach the PIN to that existing record instead of creating a duplicate.
 */
export const registerCustomer = async (
  input: {
    firstName: string;
    phone: string;
    pin: string;
  },
  jwtSign: (payload: Record<string, any>) => Promise<string>
) => {
  const formattedPhone = formatPhone(input.phone);
  const existing = await prisma.customer.findUnique({ where: { phone: formattedPhone } });

  if (existing?.pinHash) {
    throw new Error("An account already exists for this phone number. Please sign in instead.");
  }

  const pinHash = await Bun.password.hash(input.pin);

  let customer;
  if (existing) {
    // Upgrade the existing guest record to a full account
    customer = await prisma.customer.update({
      where: { id: existing.id },
      data: { firstName: input.firstName, pinHash },
    });
  } else {
    customer = await prisma.customer.create({
      data: { firstName: input.firstName, phone: formattedPhone, pinHash },
    });
  }

  const token = await jwtSign({
    sub: customer.id,
    type: "customer",
    exp: Math.floor(Date.now() / 1000) + CUSTOMER_TOKEN_EXPIRY_SEC,
  });

  return {
    token,
    customer: {
      id: customer.id,
      firstName: customer.firstName,
      phone: customer.phone,
      stallNumber: customer.stallNumber,
      marketSection: customer.marketSection,
      locationDescription: customer.locationDescription,
      hasPin: true,
    },
  };
};

/**
 * Authenticates a customer by phone + 4-digit PIN.
 */
export const loginCustomer = async (
  input: { phone: string; pin: string },
  jwtSign: (payload: Record<string, any>) => Promise<string>
) => {
  const formattedPhone = formatPhone(input.phone);
  const customer = await prisma.customer.findUnique({ where: { phone: formattedPhone } });

  if (!customer || !customer.pinHash) {
    throw new Error("No account found for this phone number. Please register first.");
  }

  const valid = await Bun.password.verify(input.pin, customer.pinHash);
  if (!valid) {
    throw new Error("Incorrect PIN. Please try again.");
  }

  const token = await jwtSign({
    sub: customer.id,
    type: "customer",
    exp: Math.floor(Date.now() / 1000) + CUSTOMER_TOKEN_EXPIRY_SEC,
  });

  return {
    token,
    customer: {
      id: customer.id,
      firstName: customer.firstName,
      phone: customer.phone,
      stallNumber: customer.stallNumber,
      marketSection: customer.marketSection,
      locationDescription: customer.locationDescription,
      hasPin: true,
    },
  };
};

/**
 * Retrieves the customer profile and their last 10 orders.
 */
export const getCustomerProfile = async (customerId: string) => {
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    include: {
      orders: {
        include: { orderItems: true },
        orderBy: { orderedAt: "desc" },
        take: 10,
      },
    },
  });

  if (!customer) {
    throw new Error("Customer not found");
  }

  return {
    id: customer.id,
    firstName: customer.firstName,
    lastName: customer.lastName,
    phone: customer.phone,
    stallNumber: customer.stallNumber,
    marketSection: customer.marketSection,
    locationDescription: customer.locationDescription,
    hasPin: Boolean(customer.pinHash),
    recentOrders: customer.orders.map((order) => ({
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

export const verifyCustomerToken = async (
  token: string,
  jwtVerify: (token: string) => Promise<Record<string, any> | false>
): Promise<string | null> => {
  try {
    const payload = await jwtVerify(token);
    if (!payload || typeof payload.sub !== "string" || payload.type !== "customer") {
      return null;
    }
    return payload.sub;
  } catch {
    return null;
  }
};
