/**
 * Purpose: Authentication Service for tableDash Admin Management.
 * Responsibilities: Performs secure password verification and issues session auth tokens.
 * Dependencies: Bun.password API, Prisma database client, Environment configuration.
 * When to modify: When updating authentication mechanisms or password hashing algorithms.
 */

import { prisma } from "../../../../../infrastructure/database/prisma";
import { formatPhone } from "../../../../../shared/phone";
import { smsService } from "../notifications/sms.service";
import type { HotelRole } from "../../../../../generated/prisma/client";

export interface AdminAuthResult {
  token: string;
  user: {
    id: string;
    username: string;
    name: string;
    role: HotelRole;
    hotelId: string | null;
  };
}

export interface AuthenticatedAdmin {
  id: string;
  username: string;
  name: string;
  role: HotelRole;
  hotelId: string | null;
}

export const loginAdmin = async (
  username: string,
  password: string,
  jwtSign: (payload: Record<string, any>) => Promise<string>
): Promise<AdminAuthResult> => {
  const user = await prisma.adminUser.findUnique({
    where: { username },
  });

  if (!user) {
    throw new Error("Invalid username or password");
  }

  const isValid = await Bun.password.verify(password, user.passwordHash);
  if (!isValid) {
    throw new Error("Invalid username or password");
  }

  const token = await jwtSign({
    sub: user.id,
    username: user.username,
    name: user.name,
    role: user.role,
    hotelId: user.hotelId,
    exp: Math.floor(Date.now() / 1000) + 64800, // 18 hours
  });

  return {
    token,
    user: {
      id: user.id,
      username: user.username,
      name: user.name,
      role: user.role,
      hotelId: user.hotelId,
    },
  };
};

export const verifyAdminToken = async (
  token: string,
  jwtVerify: (token: string) => Promise<Record<string, any> | false>
): Promise<AuthenticatedAdmin> => {
  try {
    const payload = await jwtVerify(token);

    if (!payload || typeof payload !== "object" || typeof payload.sub !== "string") {
      throw new Error("Invalid token payload structure");
    }

    const user = await prisma.adminUser.findUnique({
      where: { id: payload.sub },
    });

    if (!user) {
      throw new Error("User no longer exists");
    }

    return {
      id: user.id,
      username: user.username,
      name: user.name,
      role: user.role,
      hotelId: user.hotelId,
    };
  } catch (err) {
    throw new Error("Invalid or expired session token");
  }
};

export const loginPlatformAdmin = async (
  username: string,
  password: string,
  jwtSign: (payload: Record<string, any>) => Promise<string>
): Promise<{ token: string; user: { id: string; username: string; name: string } }> => {
  const user = await prisma.platformAdmin.findUnique({
    where: { username },
  });

  if (!user) {
    throw new Error("Invalid username or password");
  }

  const isValid = await Bun.password.verify(password, user.passwordHash);
  if (!isValid) {
    throw new Error("Invalid username or password");
  }

  const token = await jwtSign({
    sub: user.id,
    type: "platform",
    username: user.username,
    name: user.name,
    exp: Math.floor(Date.now() / 1000) + 7200,
  });

  return {
    token,
    user: {
      id: user.id,
      username: user.username,
      name: user.name,
    },
  };
};

export const verifyPlatformAdminToken = async (
  token: string,
  jwtVerify: (token: string) => Promise<Record<string, any> | false>
): Promise<{ id: string; username: string; name: string }> => {
  try {
    const payload = await jwtVerify(token);

    if (!payload || typeof payload !== "object" || payload.type !== "platform") {
      throw new Error("Invalid token payload structure");
    }

    const user = await prisma.platformAdmin.findUnique({
      where: { id: payload.sub },
    });

    if (!user) {
      throw new Error("User no longer exists");
    }

    return {
      id: user.id,
      username: user.username,
      name: user.name,
    };
  } catch (err) {
    throw new Error("Invalid or expired session token");
  }
};

const otpStore = new Map<string, { code: string; expiresAt: number }>();

export const requestPasswordResetOtp = async (phone: string): Promise<boolean> => {
  const formattedPhone = formatPhone(phone);

  // Verify this phone belongs to an admin or customer
  const admin = await prisma.adminUser.findFirst({ where: { username: formattedPhone } });
  const customer = await prisma.customer.findFirst({ where: { phone: formattedPhone } });
  if (!admin && !customer) {
    throw new Error("No account found with this phone number");
  }

  const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes

  otpStore.set(formattedPhone, { code: otpCode, expiresAt });

  const message = `Your TableDash password reset code is: ${otpCode}. It expires in 10 minutes. - TableDash Deliveries`;
  const sent = await smsService.sendSms(formattedPhone, message);

  await prisma.eventOutbox.create({
    data: {
      eventName: "hotel_admin_created", // General audit trail
      payload: JSON.stringify({
        type: "PASSWORD_RESET_OTP",
        phone: formattedPhone,
        otpCode,
        sent,
      }),
      status: "done",
    },
  });

  return sent;
};

export const resetPasswordWithOtp = async (phone: string, otpCode: string, newPassword: string): Promise<boolean> => {
  const formattedPhone = formatPhone(phone);
  const record = otpStore.get(formattedPhone);

  if (!record || record.code !== otpCode || Date.now() > record.expiresAt) {
    throw new Error("Invalid or expired OTP code");
  }

  const passwordHash = await Bun.password.hash(newPassword);

  const customer = await prisma.customer.findFirst({ where: { phone: formattedPhone } });
  if (customer) {
    await prisma.customer.update({ where: { id: customer.id }, data: { pinHash: passwordHash } });
    otpStore.delete(formattedPhone);
    return true;
  }

  // Admin usernames are phone numbers — exact match
  const admin = await prisma.adminUser.findFirst({ where: { username: formattedPhone } });
  if (admin) {
    await prisma.adminUser.update({ where: { id: admin.id }, data: { passwordHash } });
    otpStore.delete(formattedPhone);
    return true;
  }

  throw new Error("User with given phone number not found");
};

