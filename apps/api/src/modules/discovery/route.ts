import { Elysia, t } from "elysia";
import { env } from "../../../../../shared/config";
import { prisma } from "../../../../../infrastructure/database/prisma";
import { getActiveZones, getHomeDiscovery } from "./service";
import { ensureGuestIdentity, isGuestId } from "../customers/guest-identity";

export const discoveryRoute = new Elysia({
  prefix: `${env.apiPrefix}/discovery`,
  detail: { summary: "Data-backed customer discovery composition", tags: ["Discovery"] },
}).get("/zones", async ({ set }) => {
  try {
    return { success: true, data: await getActiveZones() };
  } catch {
    set.status = 500;
    return { success: false, error: "Locations are temporarily unavailable" };
  }
}).get("/hero", async ({ set }) => {
  try {
    const setting = await prisma.setting.findUnique({ where: { key: "platform_hero_image_url" }, select: { value: true } });
    return { success: true, data: { imageUrl: setting?.value ?? "" } };
  } catch {
    set.status = 500;
    return { success: false, error: "Hero image is temporarily unavailable" };
  }
}).get("/home", async ({ query, headers, set }) => {
  try {
    const guestId = headers["x-guest-id"];
    const identity = isGuestId(guestId) ? await ensureGuestIdentity(guestId) : null;
    return { success: true, data: await getHomeDiscovery(query.zoneId, query.includeAll === "true", identity?.customerId ?? undefined) };
  } catch {
    set.status = 500;
    return { success: false, error: "Discovery is temporarily unavailable" };
  }
}, { query: t.Object({ zoneId: t.Optional(t.String({ format: "uuid" })), includeAll: t.Optional(t.String()) })
});
