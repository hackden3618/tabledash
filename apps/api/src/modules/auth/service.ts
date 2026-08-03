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
import { randomUUID } from "node:crypto";

const MIN_ADMIN_PASSWORD_LENGTH = 8;
const WS_TICKET_TTL_SECONDS = 60;

export interface WebSocketTicketClaims {
  type: "ws_ticket";
  actorType: "customer" | "hotel_staff" | "platform_admin" | "guest";
  sub: string;
  exp: number;
  jti: string;
  hotelId?: string;
}

export function createWebSocketTicket(
  actor: Omit<WebSocketTicketClaims, "type" | "exp" | "jti">,
  jwtSign: (payload: Record<string, any>) => Promise<string>
) {
  return jwtSign({
    ...actor,
    type: "ws_ticket",
    jti: randomUUID(),
    exp: Math.floor(Date.now() / 1000) + WS_TICKET_TTL_SECONDS,
  });
}

function assertAdminPassword(password: string) {
  if (password.length < MIN_ADMIN_PASSWORD_LENGTH) throw new Error("Admin passwords must be at least 8 characters");
}

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
    where: { username: username.trim() },
  });

  if (!user) {
    throw new Error("Invalid username or password");
  }

  const isValid = await Bun.password.verify(password.trim(), user.passwordHash);
  if (!isValid) {
    throw new Error("Invalid username or password");
  }

  const token = await jwtSign({
    sub: user.id,
    type: "hotel_staff",
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

    if (!payload || typeof payload !== "object" || typeof payload.sub !== "string" || (payload.type !== undefined && payload.type !== "hotel_staff")) {
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

export const updateAdminProfile = async (adminId: string, input: { name?: string; username?: string }) => {
  const user = await prisma.adminUser.update({ where: { id: adminId }, data: { ...(input.name !== undefined ? { name: input.name.trim() } : {}), ...(input.username !== undefined ? { username: input.username.trim() } : {}) }, select: { id: true, username: true, name: true, role: true, hotelId: true } });
  return user;
};

export const changeAdminPassword = async (adminId: string, currentPassword: string, newPassword: string) => {
  assertAdminPassword(newPassword);
  const user = await prisma.adminUser.findUnique({ where: { id: adminId }, select: { passwordHash: true } });
  if (!user || !(await Bun.password.verify(currentPassword, user.passwordHash))) throw new Error("Current password is incorrect");
  await prisma.adminUser.update({ where: { id: adminId }, data: { passwordHash: await Bun.password.hash(newPassword) } });
};

export const loginPlatformAdmin = async (
  username: string,
  password: string,
  jwtSign: (payload: Record<string, any>) => Promise<string>
): Promise<{ token: string; user: { id: string; username: string; name: string } }> => {
  const user = await prisma.platformAdmin.findUnique({
    where: { username: username.trim() },
  });

  if (!user) {
    throw new Error("Invalid username or password");
  }

  const isValid = await Bun.password.verify(password.trim(), user.passwordHash);
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

export const updatePlatformAdminProfile = async (adminId: string, input: { name?: string; username?: string }) => {
  return prisma.platformAdmin.update({ where: { id: adminId }, data: { ...(input.name !== undefined ? { name: input.name.trim() } : {}), ...(input.username !== undefined ? { username: input.username.trim() } : {}) }, select: { id: true, username: true, name: true } });
};

export const changePlatformAdminPassword = async (adminId: string, currentPassword: string, newPassword: string) => {
  assertAdminPassword(newPassword);
  const user = await prisma.platformAdmin.findUnique({ where: { id: adminId }, select: { passwordHash: true } });
  if (!user || !(await Bun.password.verify(currentPassword, user.passwordHash))) throw new Error("Current password is incorrect");
  await prisma.platformAdmin.update({ where: { id: adminId }, data: { passwordHash: await Bun.password.hash(newPassword) } });
};

export const requestPasswordResetOtp = async (phone: string): Promise<boolean> => {
  const formattedPhone = formatPhone(phone);

  // Verify this phone belongs to an admin or customer
  const admin = await prisma.adminUser.findFirst({ where: { username: formattedPhone } });
  const customer = await prisma.customer.findFirst({ where: { phone: formattedPhone } });
  if (!admin && !customer) {
    return false;
  }

  const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes

  if (admin) {
    await prisma.adminUser.update({
      where: { id: admin.id },
      data: { resetCode: otpCode, resetCodeExpires: new Date(expiresAt) },
    });
  } else if (customer) {
    await prisma.customer.update({
      where: { id: customer.id },
      data: { pinResetCode: otpCode, pinResetCodeExpires: new Date(expiresAt) },
    });
  }

  const message = `Your Ladha password reset code is: ${otpCode}. It expires in 10 minutes. - Ladha Deliveries`;
  const sent = await smsService.sendSms(formattedPhone, message);

  return sent;
};

export const resetPasswordWithOtp = async (phone: string, otpCode: string, newPassword: string): Promise<boolean> => {
  const formattedPhone = formatPhone(phone);
  const customer = await prisma.customer.findFirst({ where: { phone: formattedPhone } });
  if (customer) {
    if (!customer.pinResetCode || customer.pinResetCode !== otpCode || !customer.pinResetCodeExpires || new Date() > customer.pinResetCodeExpires) {
      throw new Error("Invalid or expired OTP code");
    }
    const passwordHash = await Bun.password.hash(newPassword);
    await prisma.customer.update({ where: { id: customer.id }, data: { pinHash: passwordHash } });
    await prisma.customer.update({ where: { id: customer.id }, data: { pinResetCode: null, pinResetCodeExpires: null } });
    return true;
  }

  // Admin usernames are phone numbers — exact match
  const admin = await prisma.adminUser.findFirst({ where: { username: formattedPhone } });
  if (admin) {
    if (!admin.resetCode || admin.resetCode !== otpCode || !admin.resetCodeExpires || new Date() > admin.resetCodeExpires) {
      throw new Error("Invalid or expired OTP code");
    }
    assertAdminPassword(newPassword);
    const passwordHash = await Bun.password.hash(newPassword);
    await prisma.adminUser.update({ where: { id: admin.id }, data: { passwordHash } });
    await prisma.adminUser.update({ where: { id: admin.id }, data: { resetCode: null, resetCodeExpires: null } });
    return true;
  }

  throw new Error("User with given phone number not found");
};
