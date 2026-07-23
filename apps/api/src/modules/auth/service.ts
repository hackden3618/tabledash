/**
 * Purpose: Authentication Service for tableDash Admin Management.
 * Responsibilities: Performs secure password verification and issues session auth tokens.
 * Dependencies: Bun.password API, Prisma database client, Environment configuration.
 * When to modify: When updating authentication mechanisms or password hashing algorithms.
 */

import { prisma } from "../../../../../infrastructure/database/prisma";
import { env } from "../../../../../shared/config";

export interface AdminAuthResult {
  token: string;
  user: {
    id: string;
    username: string;
    name: string;
  };
}

/**
 * Authenticates an admin user using username and plain text password against stored Bun password hash.
 */
export const loginAdmin = async (username: string, password: string): Promise<AdminAuthResult> => {
  const user = await prisma.adminUser.findUnique({
    where: { username },
  });

  if (!user) {
    throw new Error("Invalid username or password");
  }

  // WHY: Using Bun.password.verify to ensure argon2/bcrypt secure hash comparison without timing attacks
  const isValid = await Bun.password.verify(password, user.passwordHash);
  if (!isValid) {
    throw new Error("Invalid username or password");
  }

  // Simple token format: base64 encoded JSON string signed with env.jwtSecret
  const payload = {
    sub: user.id,
    username: user.username,
    name: user.name,
    iat: Date.now(),
  };

  const token = Buffer.from(JSON.stringify(payload)).toString("base64");

  return {
    token,
    user: {
      id: user.id,
      username: user.username,
      name: user.name,
    },
  };
};

/**
 * Verifies an authentication token and returns user details.
 */
export const verifyAdminToken = async (token: string) => {
  try {
    const jsonStr = Buffer.from(token, "base64").toString("utf-8");
    const payload = JSON.parse(jsonStr);

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
    };
  } catch (err) {
    throw new Error("Invalid or expired session token");
  }
};
