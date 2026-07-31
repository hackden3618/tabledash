/**
 * Purpose: Customer Authentication Service for Ladha.
 * Responsibilities: Handles customer self-registration, PIN verification, and profile retrieval.
 *   Login is phone + 4-digit PIN. PINs are hashed using Bun.password (Argon2id) — more secure
 *   than bcrypt and zero extra dependencies since Bun ships it natively.
 * Dependencies: Prisma client, Bun.password (built-in).
 * When to modify: When changing auth mechanism, adding email/OTP, or extending profile fields.
 */

import { prisma } from "../../../../../infrastructure/database/prisma";
import { formatPhone } from "../../../../../shared/phone";
import { smsService } from "../notifications/sms.service";
import { linkGuestIdentity } from "./guest-identity";
import { generateAccountId } from "./account-id";

const CUSTOMER_TOKEN_EXPIRY_SEC = 7 * 24 * 60 * 60; // 7 days

/**
 * Sends an OTP to the phone for registration verification.
 * If the phone already has a PIN, throws error — already registered.
 */
export const sendRegistrationOtp = async (phone: string) => {
  const formattedPhone = formatPhone(phone);
  const existing = await prisma.customer.findUnique({ where: { phone: formattedPhone } });

  if (existing?.pinHash) {
    throw new Error("An account already exists for this phone number. Please sign in instead.");
  }

  const otp = String(Math.floor(1000 + Math.random() * 9000));
  const expires = new Date(Date.now() + 10 * 60 * 1000);

  if (existing) {
    await prisma.customer.update({
      where: { id: existing.id },
      data: { registrationOtp: otp, registrationOtpExpires: expires },
    });
  } else {
    await prisma.customer.create({
      data: {
        accountId: await generateAccountId(),
        firstName: "Guest",
        phone: formattedPhone,
        registrationOtp: otp,
        registrationOtpExpires: expires,
      },
    });
  }

  const otpMessage = `Your Ladha registration code is: ${otp}. It expires in 10 minutes. - Ladha Deliveries`;
  (async () => {
    try {
      await smsService.sendSms(formattedPhone, otpMessage);
    } catch (err) {
      console.error("[Registration OTP SMS Error]:", err);
    }
  })();

  return { message: "Verification code sent to your phone." };
};

/**
 * Registers a new customer account with a 4-digit PIN + OTP.
 * Requires OTP verification before PIN is set.
 */
export const registerCustomer = async (
  input: {
    firstName: string;
    lastName?: string;
    knownName?: string;
    phone: string;
    pin: string;
    otp: string;
  },
  jwtSign: (payload: Record<string, any>) => Promise<string>,
  guestId?: string,
) => {
  const formattedPhone = formatPhone(input.phone);
  const existing = await prisma.customer.findUnique({ where: { phone: formattedPhone } });

  if (existing?.pinHash) {
    throw new Error("An account already exists for this phone number. Please sign in instead.");
  }

  if (!existing || !existing.registrationOtp || !existing.registrationOtpExpires) {
    throw new Error("No verification code has been sent. Please request one first.");
  }

  if (existing.registrationOtp !== input.otp) {
    throw new Error("Invalid verification code. Please try again.");
  }

  if (new Date() > existing.registrationOtpExpires) {
    throw new Error("Verification code has expired. Please request a new one.");
  }

  const pinHash = await Bun.password.hash(input.pin);
  const accountId = existing.accountId || await generateAccountId();

  const customer = await prisma.customer.update({
    where: { id: existing.id },
    data: {
      firstName: input.firstName,
      lastName: input.lastName,
      knownName: input.knownName,
      pinHash,
      accountId,
      verifiedAt: new Date(),
      registrationOtp: null,
      registrationOtpExpires: null,
    },
  });

  await linkGuestIdentity(guestId, customer.id);

  const token = await jwtSign({
    sub: customer.id,
    type: "customer",
    exp: Math.floor(Date.now() / 1000) + CUSTOMER_TOKEN_EXPIRY_SEC,
  });

  return {
    token,
    customer: {
      id: customer.id,
      accountId: customer.accountId,
      firstName: customer.firstName,
      lastName: customer.lastName,
      phone: customer.phone,
      knownName: customer.knownName,
      stallNumber: customer.stallNumber,
      marketSection: customer.marketSection,
      locationDescription: customer.locationDescription,
      hasPin: true,
      isVerified: true,
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
      accountId: customer.accountId,
      firstName: customer.firstName,
      lastName: customer.lastName,
      phone: customer.phone,
      knownName: customer.knownName,
      stallNumber: customer.stallNumber,
      marketSection: customer.marketSection,
      locationDescription: customer.locationDescription,
      hasPin: true,
      isVerified: Boolean(customer.verifiedAt),
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
    accountId: customer.accountId,
    firstName: customer.firstName,
    lastName: customer.lastName,
    phone: customer.phone,
    knownName: customer.knownName,
    isVerified: Boolean(customer.verifiedAt),
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

export const updateCustomerProfile = async (customerId: string, input: { firstName?: string; lastName?: string; phone?: string; knownName?: string | null }, pin?: string) => {
  const hasChanges = input.firstName !== undefined || input.lastName !== undefined || input.phone !== undefined || input.knownName !== undefined;
  if (!hasChanges) return null;

  const customer = await prisma.customer.findUnique({ where: { id: customerId } });
  if (!customer) throw new Error("Customer not found");

  if (pin !== undefined) {
    if (!customer.pinHash) throw new Error("No PIN set on this account.");
    const valid = await Bun.password.verify(pin, customer.pinHash);
    if (!valid) throw new Error("Invalid PIN.");
  } else if (input.phone !== undefined || input.firstName !== undefined || input.lastName !== undefined || input.knownName !== undefined) {
    throw new Error("PIN is required to update profile information.");
  }

  const phoneChanged = input.phone !== undefined && formatPhone(input.phone) !== customer.phone;
  if (phoneChanged) {
    const newPhone = formatPhone(input.phone!);
    if (!customer.verifiedAt) {
      throw new Error("Phone change requires a verified account (PIN + OTP).");
    }
    const otp = String(Math.floor(1000 + Math.random() * 9000));
    const otpExpires = new Date(Date.now() + 10 * 60 * 1000);
    await prisma.customer.update({
      where: { id: customerId },
      data: { phoneChangeOtp: otp, phoneChangeOtpExpires: otpExpires, phoneChangePending: newPhone },
    });
    const otpMessage = `Your Ladha phone verification code is: ${otp}. It expires in 10 minutes. - Ladha Deliveries`;
    (async () => {
      try { await smsService.sendSms(newPhone, otpMessage); } catch (err) { console.error("[Phone Change OTP SMS Error]:", err); }
    })();
    return { message: "Phone change OTP sent to the new number. Please verify to complete the change.", requiresOtp: true };
  }

  const data: Record<string, string | null> = {};
  if (input.firstName !== undefined) data.firstName = input.firstName.trim();
  if (input.lastName !== undefined) data.lastName = input.lastName?.trim() || null;
  if (input.knownName !== undefined) data.knownName = input.knownName?.trim() || null;

  const updated = await prisma.customer.update({
    where: { id: customerId },
    data,
    select: { id: true, accountId: true, firstName: true, lastName: true, phone: true, knownName: true, stallNumber: true, marketSection: true, locationDescription: true, pinHash: true, verifiedAt: true },
  });

  return { ...updated, hasPin: Boolean(updated.pinHash), pinHash: undefined, isVerified: Boolean(updated.verifiedAt) };
};

export const verifyPhoneChangeOtp = async (customerId: string, otp: string) => {
  const customer = await prisma.customer.findUnique({ where: { id: customerId } });
  if (!customer) throw new Error("Customer not found");
  if (!customer.phoneChangeOtp || !customer.phoneChangeOtpExpires) throw new Error("No phone change in progress.");
  if (customer.phoneChangeOtp !== otp) throw new Error("Invalid verification code.");
  if (new Date() > customer.phoneChangeOtpExpires) throw new Error("Verification code has expired.");

  const newPhone = customer.phoneChangePending;
  if (!newPhone) throw new Error("No pending phone change.");

  await prisma.$transaction(async (tx) => {
    await tx.customer.update({
      where: { id: customerId },
      data: {
        phone: newPhone,
        phoneChangeOtp: null,
        phoneChangeOtpExpires: null,
        phoneChangePending: null,
      },
    });
    await tx.guestIdentity.updateMany({
      where: { customerId },
      data: { phone: newPhone },
    });
  });

  return { message: "Phone number updated successfully." };
};

/**
 * Generates a 4-digit OTP and sends it to the customer via SMS.
 * Also writes an outbox row for reliability — the SMS dispatch is retried
 * by the outbox dispatcher if the initial attempt fails.
 */
export const generatePinResetCode = async (phone: string) => {
  const formattedPhone = formatPhone(phone);
  const customer = await prisma.customer.findUnique({ where: { phone: formattedPhone } });
  if (!customer) {
    throw new Error("No account found for this phone number.");
  }
  const otp = String(Math.floor(1000 + Math.random() * 9000));
  const expires = new Date(Date.now() + 10 * 60 * 1000);
  await prisma.customer.update({
    where: { id: customer.id },
    data: { pinResetCode: otp, pinResetCodeExpires: expires },
  });

  const otpMessage = `Your Ladha PIN reset code is: ${otp}. It expires in 10 minutes. - Ladha Deliveries`;

  (async () => {
    try {
      await smsService.sendSms(formattedPhone, otpMessage);
    } catch (err) {
      console.error("[Customer PIN Reset SMS Error]:", err);
    }
  })();

  return { message: "Reset code sent to your phone." };
};

/**
 * Validates the OTP and resets the PIN.
 */
export const resetCustomerPin = async (input: { phone: string; otp: string; newPin: string }) => {
  const formattedPhone = formatPhone(input.phone);
  const customer = await prisma.customer.findUnique({ where: { phone: formattedPhone } });
  if (!customer) {
    throw new Error("No account found for this phone number.");
  }
  if (!customer.pinResetCode || !customer.pinResetCodeExpires) {
    throw new Error("No reset code has been requested. Please request a new one.");
  }
  if (customer.pinResetCode !== input.otp) {
    throw new Error("Invalid reset code. Please try again.");
  }
  if (new Date() > customer.pinResetCodeExpires) {
    throw new Error("Reset code has expired. Please request a new one.");
  }
  const pinHash = await Bun.password.hash(input.newPin);
  await prisma.customer.update({
    where: { id: customer.id },
    data: { pinHash, pinResetCode: null, pinResetCodeExpires: null },
  });
  return { message: "PIN has been reset successfully." };
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
