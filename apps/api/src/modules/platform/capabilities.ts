/**
 * Purpose: Platform role capabilities + shared platform-route auth guard.
 * Responsibilities: Maps PlatformRole → allowed capabilities and resolves the
 *   acting platform admin from a Bearer token, rejecting requests that the
 *   actor's role cannot perform. Authorization lives server-side only.
 * Dependencies: platformAdmin token verification from auth service.
 */

import { verifyPlatformAdminToken } from "../auth/service";

export type PlatformCapability =
  | "geography:read"
  | "geography:write"
  | "geography:deactivate"
  | "geography:reclassify"
  | "hotels:write"
  | "admins:read"
  | "admins:write"
  | "outbox:retry"
  | "audit:read"
  | "support:lookup";

const ROLE_CAPABILITIES: Record<string, PlatformCapability[]> = {
  PLATFORM_OWNER: [
    "geography:read",
    "geography:write",
    "geography:deactivate",
    "geography:reclassify",
    "hotels:write",
    "admins:read",
    "admins:write",
    "outbox:retry",
    "audit:read",
    "support:lookup",
  ],
  PLATFORM_OPERATIONS: [
    "geography:read",
    "geography:write",
    "geography:deactivate",
    "geography:reclassify",
    "hotels:write",
    "admins:read",
    "outbox:retry",
    "audit:read",
    "support:lookup",
  ],
  PLATFORM_SUPPORT: ["geography:read", "audit:read", "support:lookup"],
  PLATFORM_AUDITOR: ["geography:read", "audit:read"],
};

export const can = (role: string, capability: PlatformCapability): boolean => (ROLE_CAPABILITIES[role] ?? []).includes(capability);

export const ROLE_LABELS: Record<string, string> = {
  PLATFORM_OWNER: "Owner",
  PLATFORM_OPERATIONS: "Operations",
  PLATFORM_SUPPORT: "Support",
  PLATFORM_AUDITOR: "Auditor",
};

export class PlatformAuthError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export interface PlatformActor {
  id: string;
  username: string;
  name: string;
  role: string;
}

/**
 * Resolves and authorizes the acting platform admin. Throws PlatformAuthError
 * (401 unauthorized / 403 forbidden) that route handlers translate into
 * responses — never rely on hidden UI actions.
 */
export async function requirePlatformActor(headers: Record<string, string | undefined>, jwt: any, capability?: PlatformCapability): Promise<PlatformActor> {
  const authHeader = headers["authorization"];
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw new PlatformAuthError(401, "Missing or invalid authorization header");
  }
  const token = authHeader.split(" ")[1]!;
  let admin;
  try {
    admin = await verifyPlatformAdminToken(token, (t) => jwt.verify(t));
  } catch {
    throw new PlatformAuthError(401, "Invalid or expired platform session token");
  }
  if (capability && !can(admin.role, capability)) {
    throw new PlatformAuthError(403, `Your platform role (${ROLE_LABELS[admin.role] ?? admin.role}) does not permit this action.`);
  }
  return admin;
}