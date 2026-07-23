/**
 * Purpose: Authentication Service for tableDash Admin Management.
 * Responsibilities: Performs secure password verification and issues session auth tokens.
 * Dependencies: Bun.password API, Prisma database client, Environment configuration.
 * When to modify: When updating authentication mechanisms or password hashing algorithms.
 */

import { prisma } from "../../../../../infrastructure/database/prisma";

export interface AdminAuthResult {
  token: string;
  user: {
    id: string;
    username: string;
    name: string;
  };
}

/**
 * Authenticates an admin user using username and plain text password against stored Bun password hash, issuing a JWT.
 */
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

  // WHY: Using Bun.password.verify to ensure argon2/bcrypt secure hash comparison without timing attacks
  const isValid = await Bun.password.verify(password, user.passwordHash);
  if (!isValid) {
    throw new Error("Invalid username or password");
  }

  const token = await jwtSign({
    sub: user.id,
    username: user.username,
    name: user.name,
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

/**
 * Verifies an authentication JWT token and returns user details.
 */
export const verifyAdminToken = async (
  token: string,
  jwtVerify: (token: string) => Promise<Record<string, any> | false>
) => {
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
    };
  } catch (err) {
    throw new Error("Invalid or expired session token");
  }
};
