/**
 * Purpose: One-time password-setup links for newly provisioned accounts.
 * Responsibilities: Creates hashed setup tokens for new admins/staff/platform
 *   admins and validates/consumes them at /set-password. The raw token is only
 *   ever sent over SMS; only its hash is persisted.
 * Dependencies: Prisma client, shared/config env singleton.
 * When to modify: When changing token expiry, hashing, or the set-password flow.
 */

import { prisma } from "../../../../../infrastructure/database/prisma";
import { env } from "../../../../../shared/config";
import type { Prisma } from "../../../../../generated/prisma/client";
import { createHash, randomBytes } from "node:crypto";

export type PasswordSetupUserType = "HOTEL_ADMIN" | "HOTEL_STAFF" | "PLATFORM_ADMIN";

export const SETUP_TOKEN_TTL: Record<PasswordSetupUserType, number> = {
  HOTEL_ADMIN: 24 * 60 * 60 * 1000,
  HOTEL_STAFF: 24 * 60 * 60 * 1000,
  PLATFORM_ADMIN: 2 * 60 * 60 * 1000,
};

function hashToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

export function buildSetupLink(rawToken: string): string {
  return `${env.publicUrl}/set-password?token=${encodeURIComponent(rawToken)}`;
}

/**
 * Creates a one-time setup token for an account and returns the raw token.
 * The caller embeds the raw token in the SMS payload; only the hash is stored.
 * Pass `tx` when called inside a transaction so the token is committed atomically
 * with the account that will consume it.
 */
export async function createPasswordSetupToken(
  userId: string,
  userType: PasswordSetupUserType,
  tx?: Prisma.TransactionClient
): Promise<{ rawToken: string; setupLink: string; expiresAt: Date }> {
  const client = tx ?? prisma;
  const rawToken = randomBytes(24).toString("base64url");
  const expiresAt = new Date(Date.now() + SETUP_TOKEN_TTL[userType]);

  await client.passwordSetupToken.create({
    data: {
      userId,
      userType,
      tokenHash: hashToken(rawToken),
      expiresAt,
    },
  });

  return { rawToken, setupLink: buildSetupLink(rawToken), expiresAt };
}

/**
 * Consumes a raw setup token and sets the account's real password.
 * Rejects reused, expired, or unknown tokens.
 */
export async function setPasswordFromSetupToken(rawToken: string, newPassword: string): Promise<{ userType: PasswordSetupUserType }> {
  const tokenHash = hashToken(rawToken);

  const token = await prisma.passwordSetupToken.findUnique({ where: { tokenHash } });
  if (!token) throw new Error("This setup link is invalid or has already been used.");
  if (token.usedAt) throw new Error("This setup link has already been used.");
  if (token.expiresAt.getTime() < Date.now()) throw new Error("This setup link has expired. Ask your administrator to send a new one.");

  const passwordHash = await Bun.password.hash(newPassword);

  if (token.userType === "PLATFORM_ADMIN") {
    await prisma.platformAdmin.update({ where: { id: token.userId }, data: { passwordHash } });
  } else {
    const result = await prisma.adminUser.updateMany({ where: { id: token.userId }, data: { passwordHash } });
    if (result.count === 0) throw new Error("This account no longer exists.");
  }

  await prisma.passwordSetupToken.update({ where: { id: token.id }, data: { usedAt: new Date() } });

  return { userType: token.userType as PasswordSetupUserType };
}
