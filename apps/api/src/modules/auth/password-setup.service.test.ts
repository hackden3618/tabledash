import { describe, expect, test, mock, beforeEach } from "bun:test";
import { setPasswordFromSetupToken, createPasswordSetupToken, SETUP_TOKEN_TTL } from "./password-setup.service";

// ── In-memory store mirroring the password_setup_tokens table ──
let tokenRows: {
  id: string;
  userId: string;
  userType: string;
  tokenHash: string;
  expiresAt: Date;
  usedAt: Date | null;
}[] = [];
let updatedAdmin: { id: string; passwordHash?: string } | null = null;
let updatedPlatformAdmin: { id: string; passwordHash?: string } | null = null;

mock.module("../../../../../infrastructure/database/prisma", () => ({
  prisma: {
    passwordSetupToken: {
      create: async (args: any) => {
        const row = { id: `tok-${tokenRows.length + 1}`, ...args.data };
        tokenRows.push(row);
        return row;
      },
      findUnique: async (args: any) => {
        const row = tokenRows.find((r) => r.tokenHash === args.where.tokenHash);
        return row ? { ...row } : null;
      },
      update: async (args: any) => {
        const row = tokenRows.find((r) => r.id === args.where.id);
        if (!row) throw new Error("not found");
        Object.assign(row, args.data);
        return { ...row };
      },
    },
    adminUser: {
      updateMany: async (args: any) => {
        updatedAdmin = { id: args.where.id, passwordHash: args.data.passwordHash };
        return { count: 1 };
      },
    },
    platformAdmin: {
      update: async (args: any) => {
        updatedPlatformAdmin = { id: args.where.id, passwordHash: args.data.passwordHash };
        return { id: args.where.id };
      },
    },
  },
}));

describe("password setup tokens", () => {
  beforeEach(() => {
    tokenRows = [];
    updatedAdmin = null;
    updatedPlatformAdmin = null;
  });

  test("creates a token with the hotel 24h TTL and a setup link", async () => {
    const { rawToken, setupLink, expiresAt } = await createPasswordSetupToken("admin-1", "HOTEL_ADMIN");

    expect(rawToken.length).toBeGreaterThanOrEqual(32);
    expect(setupLink).toContain("/set-password?token=");
    expect(expiresAt.getTime() - Date.now()).toBeCloseTo(SETUP_TOKEN_TTL.HOTEL_ADMIN, -4);
    // Only the hash is stored, never the raw token
    expect(tokenRows[0]?.tokenHash).not.toContain(rawToken);
  });

  test("sets a platform admin password with the 2h TTL", async () => {
    const { rawToken, expiresAt } = await createPasswordSetupToken("platform-1", "PLATFORM_ADMIN");
    expect(expiresAt.getTime() - Date.now()).toBeCloseTo(SETUP_TOKEN_TTL.PLATFORM_ADMIN, -4);

    const result = await setPasswordFromSetupToken(rawToken, "StrongPass123");

    expect(result.userType).toBe("PLATFORM_ADMIN");
    expect(updatedPlatformAdmin?.id).toBe("platform-1");
    expect(updatedPlatformAdmin?.passwordHash).toBeDefined();
    expect(tokenRows[0]?.usedAt).not.toBeNull();
  });

  test("sets a hotel admin/staff password through the same token", async () => {
    const { rawToken } = await createPasswordSetupToken("admin-9", "HOTEL_STAFF");

    const result = await setPasswordFromSetupToken(rawToken, "StrongPass123");

    expect(result.userType).toBe("HOTEL_STAFF");
    expect(updatedAdmin?.id).toBe("admin-9");
  });

  test("rejects a reused token", async () => {
    const { rawToken } = await createPasswordSetupToken("admin-1", "HOTEL_ADMIN");
    await setPasswordFromSetupToken(rawToken, "StrongPass123");

    expect(() => setPasswordFromSetupToken(rawToken, "AnotherPass123")).toThrow(/already been used/i);
  });

  test("rejects an unknown token", async () => {
    expect(() => setPasswordFromSetupToken("not-a-real-token", "StrongPass123")).toThrow(/invalid/i);
  });

  test("rejects an expired token", async () => {
    // Expire the token in the store by backdating expiresAt
    const { rawToken } = await createPasswordSetupToken("admin-1", "HOTEL_ADMIN");
    tokenRows[0]!.expiresAt = new Date("2025-01-01T00:00:00Z");

    expect(() => setPasswordFromSetupToken(rawToken, "StrongPass123")).toThrow(/expired/i);
  });
});
