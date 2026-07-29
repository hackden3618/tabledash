import { verifyAdminToken } from "../auth/service";
import { verifyPlatformAdminToken } from "../auth/service";
import { verifyCustomerToken } from "../customers/auth.service";
import type { MessagingActor } from "./service";
import { prisma } from "../../../../../infrastructure/database/prisma";
import { ensureGuestIdentity, isGuestId } from "../customers/guest-identity";

export async function resolveMessagingActor(
  headers: Record<string, string | undefined>,
  jwtVerify: (token: string) => Promise<Record<string, any> | false>
): Promise<MessagingActor> {
  const auth = headers.authorization;
  if (auth?.startsWith("Bearer ")) {
    const token = auth.slice("Bearer ".length).trim();
    try {
      const customerId = await verifyCustomerToken(token, jwtVerify);
      if (customerId) return { kind: "CUSTOMER", customerId };
    } catch {}
    try {
      const admin = await verifyAdminToken(token, jwtVerify);
      if (admin.hotelId) return { kind: "HOTEL_STAFF", adminUserId: admin.id, hotelId: admin.hotelId };
    } catch {}
    try {
      const platform = await verifyPlatformAdminToken(token, jwtVerify);
      return { kind: "PLATFORM_ADMIN", platformAdminId: platform.id };
    } catch {}
  }

  const guestId = headers["x-guest-id"] ?? headers["X-Guest-Id"] ?? headers["guestId"];
  if (!isGuestId(guestId)) throw new Error("Sign in or provide a valid guest identity");
  const identity = await ensureGuestIdentity(guestId);
  return { kind: "GUEST", guestIdentityId: identity.id, customerId: identity.customerId ?? undefined };
}

export async function resolveMessagingActorFromWebSocketTicket(payload: Record<string, any>): Promise<MessagingActor> {
  if (payload.type !== "ws_ticket" || typeof payload.sub !== "string") {
    throw new Error("Invalid WebSocket ticket");
  }

  if (payload.actorType === "customer") {
    const customer = await prisma.customer.findUnique({ where: { id: payload.sub }, select: { id: true } });
    if (!customer) throw new Error("Customer no longer exists");
    return { kind: "CUSTOMER", customerId: customer.id };
  }

  if (payload.actorType === "hotel_staff") {
    const admin = await prisma.adminUser.findUnique({ where: { id: payload.sub }, select: { id: true, hotelId: true } });
    if (!admin?.hotelId) throw new Error("Hotel staff account is no longer active");
    return { kind: "HOTEL_STAFF", adminUserId: admin.id, hotelId: admin.hotelId };
  }

  if (payload.actorType === "platform_admin") {
    const admin = await prisma.platformAdmin.findUnique({ where: { id: payload.sub }, select: { id: true } });
    if (!admin) throw new Error("Platform account is no longer active");
    return { kind: "PLATFORM_ADMIN", platformAdminId: admin.id };
  }

  if (payload.actorType === "guest" && isGuestId(payload.sub)) {
    const identity = await ensureGuestIdentity(payload.sub);
    return { kind: "GUEST", guestIdentityId: identity.id, customerId: identity.customerId ?? undefined };
  }

  throw new Error("Invalid WebSocket ticket actor");
}
