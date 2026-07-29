import { verifyAdminToken } from "../auth/service";
import { verifyPlatformAdminToken } from "../auth/service";
import { verifyCustomerToken } from "../customers/auth.service";
import { ensureGuestIdentity, isGuestId } from "../customers/guest-identity";
import type { MessagingActor } from "./service";

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
