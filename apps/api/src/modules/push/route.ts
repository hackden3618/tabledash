import { jwt } from "@elysiajs/jwt";
import { Elysia, t } from "elysia";
import { env } from "../../../../../shared/config";
import { verifyAdminToken } from "../auth/service";
import { verifyCustomerToken } from "../customers/auth.service";
import { saveSubscription, removeSubscription } from "./service";

/**
 * Push subscriptions are owned by whichever token is presented: an admin JWT
 * (hotelId from the token — kitchen alerts fan out per-hotel) or a customer
 * JWT. Anonymous/guest devices are not supported — Web Push requires a stable
 * owner to re-target on the next login, and guests don't have one.
 */
export const pushRoute = new Elysia({ prefix: "/api/v1/push" })
  .use(jwt({ name: "jwt", secret: env.jwtSecret }))
  .get("/vapid-public-key", ({ set }) => {
    if (!env.vapidPublicKey) {
      set.status = 503;
      return { success: false, error: "Push notifications not configured — set VAPID_PUBLIC_KEY on Railway." };
    }
    return { success: true, data: { key: env.vapidPublicKey } };
  })
  .post(
    "/subscribe",
    async ({ body, headers, jwt, set }) => {
      const authHeader = headers["authorization"];
      const token = authHeader?.startsWith("Bearer ") ? authHeader.split(" ")[1]! : "";
      if (!token) {
        set.status = 401;
        return { success: false, error: "Missing authorization" };
      }

      const admin = await verifyAdminToken(token, (t) => jwt.verify(t)).catch(() => null);
      const customerId = admin ? null : await verifyCustomerToken(token, (t) => jwt.verify(t));

      if (!admin && !customerId) {
        set.status = 403;
        return { success: false, error: "Invalid session" };
      }

      await saveSubscription({
        ownerType: admin ? "ADMIN" : "CUSTOMER",
        ownerId: admin ? admin.id : customerId!,
        hotelId: admin?.hotelId ?? undefined,
        endpoint: body.endpoint,
        p256dh: body.keys.p256dh,
        auth: body.keys.auth,
        userAgent: headers["user-agent"],
      });

      return { success: true };
    },
    {
      body: t.Object({
        endpoint: t.String(),
        keys: t.Object({ p256dh: t.String(), auth: t.String() }),
      }),
      detail: { tags: ["Push"], summary: "Register a browser push subscription for the current session" },
    }
  )
  .post(
    "/unsubscribe",
    async ({ body }) => {
      await removeSubscription(body.endpoint);
      return { success: true };
    },
    { body: t.Object({ endpoint: t.String() }) }
  );
