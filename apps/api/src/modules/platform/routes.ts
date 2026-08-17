import { jwt } from "@elysiajs/jwt";
import { Elysia, t } from "elysia";
import { env } from "../../../../../shared/config";
import { formatPhone } from "../../../../../shared/phone";
import { getAllHotels } from "../hotels/service";
import { loginPlatformAdmin, updatePlatformAdminProfile, changePlatformAdminPassword } from "../auth/service";
import { createPasswordSetupToken, buildSetupLink } from "../auth/password-setup.service";
import { prisma } from "../../../../../infrastructure/database/prisma";
import { requirePlatformActor, PlatformAuthError, can } from "./capabilities";
import { AUTH_LIMITER } from "../../lib/rate-limiter";
import { writeAudit } from "../geography/service";

export const platformRoute = new Elysia({
  prefix: `${env.apiPrefix}/platform`,
  detail: {
    summary: "Platform admin panel — hotel provisioning, admin mgmt, audit",
    tags: ["Platform"],
  },
})
  .use(
    jwt({
      name: "jwt",
      secret: env.jwtSecret,
    })
  )
  .post(
    "/login",
    async ({ body, jwt, set, request }) => {
      const ip = request.headers.get("x-forwarded-for") ?? "unknown";
      const { allowed, resetIn } = AUTH_LIMITER(`platform-login:${ip}`);
      if (!allowed) {
        set.status = 429;
        set.headers["retry-after"] = String(Math.ceil(resetIn / 1000));
        return { success: false, error: `Too many attempts. Try again in ${Math.ceil(resetIn / 1000)}s.` };
      }
      try {
        const result = await loginPlatformAdmin(body.username, body.password, (payload) => jwt.sign(payload));
        return { success: true, data: result };
      } catch (err: any) {
        set.status = 401;
        return { success: false, error: err.message };
      }
    },
    {
      body: t.Object({
        username: t.String({ minLength: 3 }),
        password: t.String({ minLength: 8 }),
      }),
    }
  )
  .patch("/me", async ({ headers, jwt, body, set }) => {
    try {
      const admin = await requirePlatformActor(headers, jwt);
      if (body.username?.trim().toLowerCase() === "hackden" && admin.username.toLowerCase() !== "hackden") { set.status = 403; return { success: false, error: "That protected username is reserved" }; }
      if (body.currentPassword || body.newPassword) {
        if (!body.currentPassword || !body.newPassword) throw new Error("Current and new passwords are required");
        await changePlatformAdminPassword(admin.id, body.currentPassword, body.newPassword);
      }
      const profile = body.name !== undefined || body.username !== undefined ? await updatePlatformAdminProfile(admin.id, body) : admin;
      return { success: true, data: profile };
    } catch (err: any) { set.status = err.code === "P2002" ? 409 : 400; return { success: false, error: err.code === "P2002" ? "That username is already in use." : err.message || "Unable to update profile" }; }
  }, { body: t.Object({ name: t.Optional(t.String({ minLength: 1, maxLength: 100 })), username: t.Optional(t.String({ minLength: 3, maxLength: 80 })), currentPassword: t.Optional(t.String({ minLength: 1 })), newPassword: t.Optional(t.String({ minLength: 8, maxLength: 120 })) }) })
  .get(
    "/dashboard",
    async ({ headers, jwt, set }) => {
      try { await requirePlatformActor(headers, jwt); }
      catch (err: any) { set.status = err.status ?? 401; return { success: false, error: err.message }; }

      const hotels = await getAllHotels();
      const admins = await prisma.platformAdmin.count();
      const totalOrders = await prisma.order.count();
      const failedOutbox = await prisma.eventOutbox.count({ where: { status: "failed" } });

      return {
        success: true,
        data: {
          hotelCount: hotels.length,
          activeHotelCount: hotels.filter((h) => h.isOpen).length,
          platformAdminCount: admins,
          totalOrders,
          failedOutboxCount: failedOutbox,
          platformBrand: "Ladha Deliveries",
        },
      };
    }
  )
  .get("/hero", async ({ headers, jwt, set }) => {
    try { await requirePlatformActor(headers, jwt); }
    catch (err: any) { set.status = err.status ?? 401; return { success: false, error: err.message }; }
    const setting = await prisma.setting.findUnique({ where: { key: "platform_hero_image_url" } });
    return { success: true, data: { imageUrl: setting?.value ?? "" } };
  })
  .patch("/hero", async ({ body, headers, jwt, set }) => {
    try { await requirePlatformActor(headers, jwt, "hotels:write"); }
    catch (err: any) { set.status = err.status ?? 401; return { success: false, error: err.message }; }
    const imageUrl = body.imageUrl.trim();
    const existingHero = await prisma.setting.findUnique({ where: { key: "platform_hero_image_url" } });
    if (existingHero?.value && existingHero.value !== imageUrl) {
      const { deleteMediaByUrl } = await import("../media/service");
      void deleteMediaByUrl(existingHero.value);
    }
    const setting = await prisma.setting.upsert({ where: { key: "platform_hero_image_url" }, update: { value: imageUrl }, create: { key: "platform_hero_image_url", value: imageUrl } });
    return { success: true, data: { imageUrl: setting.value } };
  }, { body: t.Object({ imageUrl: t.String({ maxLength: 2000 }) }) })
  .get(
    "/hotels",
    async ({ headers, jwt, set, query }) => {
      try { await requirePlatformActor(headers, jwt); }
      catch (err: any) { set.status = err.status ?? 401; return { success: false, error: err.message }; }

      let hotels = await prisma.hotel.findMany({
        where: query.all === "true" ? {} : { deletedAt: null },
        orderBy: { createdAt: "desc" },
        include: {
          adminUsers: { select: { id: true, name: true, username: true, role: true } },
          zone: { include: { megaRegion: true } },
        },
      });

      if (query.search) {
        const q = (query.search as string).toLowerCase();
        hotels = hotels.filter((h) => h.name.toLowerCase().includes(q) || h.slug.toLowerCase().includes(q));
      }

      return { success: true, data: hotels };
    },
    {
      query: t.Object({
        search: t.Optional(t.String()),
        all: t.Optional(t.String()),
      }),
    }
  )
  .get(
    "/hotels/:id",
    async ({ params, headers, jwt, set }) => {
      try { await requirePlatformActor(headers, jwt); }
      catch (err: any) { set.status = err.status ?? 401; return { success: false, error: err.message }; }

      const hotel = await prisma.hotel.findUnique({
        where: { id: params.id },
        include: {
          adminUsers: { select: { id: true, name: true, username: true, role: true, createdAt: true } },
          staffUsers: { select: { id: true, name: true, phone: true, createdAt: true } },
          zone: true,
          _count: { select: { orders: true } },
        },
      });
      if (!hotel) { set.status = 404; return { success: false, error: "Hotel not found" }; }

      const events = await prisma.eventOutbox.findMany({
        where: { hotelId: params.id, eventName: { in: ["hotel_created", "hotel_status_updated", "hotel_admin_created"] } },
        orderBy: { createdAt: "desc" },
        take: 20,
      });

      return { success: true, data: { ...hotel, events: events.map((e) => ({ ...e, payload: JSON.parse(e.payload) })) } };
    },
    { params: t.Object({ id: t.String({ format: "uuid" }) }) }
  )
  .post(
    "/hotels",
    async ({ body, headers, jwt, set }) => {
      let admin;
      try { admin = await requirePlatformActor(headers, jwt, "hotels:write"); }
      catch (err: any) { set.status = err.status ?? 401; return { success: false, error: err.message }; }

      try {
        // No inactive town may be used for hotel onboarding — geography rules
        // are enforced server-side, never by hiding UI options.
        const town = await prisma.zone.findUnique({ where: { id: body.zoneId } });
        if (!town) { set.status = 400; return { success: false, error: "The selected town no longer exists." }; }
        if (!town.active) { set.status = 400; return { success: false, error: `Town "${town.name}" is inactive. Activate it before onboarding hotels.` }; }

        // No password is ever generated or stored in plaintext for new accounts.
        // The account starts locked (unknowable random hash); the SMS sent by the
        // outbox handler carries a one-time setup link to set a real password.
        const lockedHash = await Bun.password.hash(crypto.randomUUID());
        const formattedAdminPhone = body.adminPhone ? formatPhone(body.adminPhone) : null;

        const result = await prisma.$transaction(async (tx) => {
          const hotel = await tx.hotel.create({
            data: {
              name: body.name,
              slug: body.slug,
              isOpen: body.isOpen ?? true,
              autoCloseAt: body.autoCloseAt ? new Date(body.autoCloseAt) : null,
              zone: { connect: { id: body.zoneId } },
            },
          });

          const adminUser = await tx.adminUser.create({
            data: {
              username: body.adminUsername,
              passwordHash: lockedHash,
              name: body.adminName,
              hotelId: hotel.id,
              role: "HOTEL_ADMIN",
            },
          });

          // receiveSms starts false, deliberately — this StaffUser row exists so
          // the admin has a contactable phone on file (used for WhatsApp "talk to
          // staff" and as their StaffUser identity), but it must NOT auto-enroll
          // in the SMS order-alert list. Whoever creates the hotel account here is
          // the platform operator doing onboarding, not necessarily hotel staff.
          await tx.staffUser.create({
            data: {
              name: body.adminName,
              phone: formattedAdminPhone!,
              receiveSms: false,
              hotelId: hotel.id,
              adminUserId: adminUser.id,
            },
          });

          const { rawToken } = await createPasswordSetupToken(adminUser.id, "HOTEL_ADMIN", tx);

          await tx.eventOutbox.create({
            data: {
              eventName: "hotel_created",
              payload: JSON.stringify({
                hotelId: hotel.id,
                hotelName: hotel.name,
                adminName: body.adminName,
                adminUsername: body.adminUsername,
                adminPhone: formattedAdminPhone,
                setupToken: rawToken,
                createdBy: admin.name,
              }),
              hotelId: hotel.id,
              status: "initialized",
            },
          });

          await writeAudit(tx, admin, "hotel", hotel.id, "create_hotel", `Created "${hotel.name}" in town "${town.name}"`);

          return { hotel, adminUser, setupToken: rawToken };
        });

        return {
          success: true,
          data: {
            hotel: result.hotel,
            adminUser: { id: result.adminUser.id, username: result.adminUser.username, name: result.adminUser.name },
            setupLink: buildSetupLink(result.setupToken),
          },
        };
      } catch (err: any) {
        set.status = 400;
        return { success: false, error: err.message };
      }
    },
    {
      body: t.Object({
        name: t.String({ minLength: 1 }),
        slug: t.String({ minLength: 1, pattern: "^[a-z0-9-]+$" }),
        adminUsername: t.String({ minLength: 3 }),
        adminName: t.String({ minLength: 1 }),
        adminPhone: t.String({ minLength: 10, maxLength: 13 }),
        isOpen: t.Optional(t.Boolean()),
        autoCloseAt: t.Optional(t.String()),
        zoneId: t.String({ format: "uuid" }),
      }),
    }
  )
  .patch(
    "/hotels/:id/toggle",
    async ({ params, headers, jwt, set }) => {
      let admin;
      try { admin = await requirePlatformActor(headers, jwt, "hotels:write"); }
      catch (err: any) { set.status = err.status ?? 401; return { success: false, error: err.message }; }

      const hotel = await prisma.hotel.findUnique({ where: { id: params.id } });
      if (!hotel) { set.status = 404; return { success: false, error: "Hotel not found" }; }

      const updated = await prisma.hotel.update({
        where: { id: params.id },
        data: { isOpen: !hotel.isOpen },
      });

      await prisma.eventOutbox.create({
        data: {
          eventName: "hotel_status_updated",
          payload: JSON.stringify({
            hotelId: hotel.id,
            hotelName: hotel.name,
            newStatus: updated.isOpen ? "open" : "closed",
            previousStatus: hotel.isOpen ? "open" : "closed",
            changedBy: admin.name,
          }),
          hotelId: hotel.id,
          status: "done",
          completedAt: new Date(),
        },
      });

      return { success: true, data: updated };
    },
    { params: t.Object({ id: t.String({ format: "uuid" }) }) }
  )
  .patch(
    "/hotels/:id/listing",
    async ({ params, body, headers, jwt, set }) => {
      let admin;
      try { admin = await requirePlatformActor(headers, jwt, "hotels:write"); }
      catch (err: any) { set.status = err.status ?? 401; return { success: false, error: err.message }; }

      const hotel = await prisma.hotel.findUnique({ where: { id: params.id } });
      if (!hotel) { set.status = 404; return { success: false, error: "Hotel not found" }; }

      const updated = await prisma.hotel.update({
        where: { id: params.id },
        data: { isListed: body.isListed },
      });

      await prisma.eventOutbox.create({
        data: {
          eventName: "hotel_status_updated",
          payload: JSON.stringify({
            hotelId: hotel.id,
            hotelName: hotel.name,
            newStatus: updated.isListed ? "listed" : "hidden",
            previousStatus: hotel.isListed ? "listed" : "hidden",
            changedBy: admin.name,
          }),
          hotelId: hotel.id,
          status: "done",
          completedAt: new Date(),
        },
      });

      return { success: true, data: updated };
    },
    {
      params: t.Object({ id: t.String({ format: "uuid" }) }),
      body: t.Object({ isListed: t.Boolean() }),
      detail: { tags: ["Platform"], summary: "Show/hide a hotel from the customer-facing marketplace without deleting it" },
    }
  )
  .delete(
    "/hotels/:id",
    async ({ params, headers, jwt, set }) => {
      let admin;
      try { admin = await requirePlatformActor(headers, jwt, "hotels:write"); }
      catch (err: any) { set.status = err.status ?? 401; return { success: false, error: err.message }; }

      const hotel = await prisma.hotel.findUnique({ where: { id: params.id } });
      if (!hotel) { set.status = 404; return { success: false, error: "Hotel not found" }; }
      if (hotel.deletedAt) { set.status = 400; return { success: false, error: "Hotel is already deleted" }; }

      // Soft delete only — an order history, ledger, and review trail can exist
      // for this hotel, and hard-deleting would either cascade-destroy that
      // financial record or fail on the FK constraints protecting it.
      const updated = await prisma.hotel.update({
        where: { id: params.id },
        data: { deletedAt: new Date(), isListed: false, isOpen: false },
      });

      await prisma.eventOutbox.create({
        data: {
          eventName: "hotel_status_updated",
          payload: JSON.stringify({
            hotelId: hotel.id,
            hotelName: hotel.name,
            newStatus: "deleted",
            previousStatus: hotel.isOpen ? "open" : "closed",
            changedBy: admin.name,
          }),
          hotelId: hotel.id,
          status: "done",
          completedAt: new Date(),
        },
      });

      return { success: true, data: updated };
    },
    {
      params: t.Object({ id: t.String({ format: "uuid" }) }),
      detail: { tags: ["Platform"], summary: "Soft-delete a hotel (removes it from all listings; order/ledger history is preserved)" },
    }
  )
  .patch(
    "/hotels/:id",
    async ({ params, body, headers, jwt, set }) => {
      let admin;
      try { admin = await requirePlatformActor(headers, jwt, "hotels:write"); }
      catch (err: any) { set.status = err.status ?? 401; return { success: false, error: err.message }; }

      const hotel = await prisma.hotel.findUnique({ where: { id: params.id }, include: { zone: true } });
      if (!hotel) { set.status = 404; return { success: false, error: "Hotel not found" }; }

      // Reassigning a hotel to another town is a sensitive geography change:
      // audit it explicitly and never allow moving into an inactive town.
      let moved = "";
      if (body.zoneId && body.zoneId !== hotel.zoneId) {
        const targetTown = await prisma.zone.findUnique({ where: { id: body.zoneId } });
        if (!targetTown) { set.status = 400; return { success: false, error: "The selected town no longer exists." }; }
        if (!targetTown.active) { set.status = 400; return { success: false, error: `Town "${targetTown.name}" is inactive. Activate it before moving the hotel.` }; }
        moved = `; moved to town "${targetTown.name}"`;
      }

      const updated = await prisma.$transaction(async (tx) => {
        const result = await tx.hotel.update({
          where: { id: params.id },
          data: {
            name: body.name ?? hotel.name,
            slug: body.slug ?? hotel.slug,
            isOpen: body.isOpen !== undefined ? body.isOpen : hotel.isOpen,
            imageUrl: body.imageUrl !== undefined ? body.imageUrl : hotel.imageUrl,
            autoCloseAt: body.autoCloseAt !== undefined ? (body.autoCloseAt ? new Date(body.autoCloseAt) : null) : hotel.autoCloseAt,
            ...(body.zoneId ? { zoneId: body.zoneId } : {}),
          },
          include: { zone: { include: { megaRegion: true } } },
        });
        if (moved) await writeAudit(tx, admin, "hotel", hotel.id, "reassign_hotel", `Updated "${hotel.name}"${moved}`);
        return result;
      });

      return { success: true, data: updated };
    },
    {
      params: t.Object({ id: t.String({ format: "uuid" }) }),
      body: t.Object({
        name: t.Optional(t.String()),
        slug: t.Optional(t.String()),
        isOpen: t.Optional(t.Boolean()),
        imageUrl: t.Optional(t.String()),
        autoCloseAt: t.Optional(t.String()),
        zoneId: t.Optional(t.String({ format: "uuid" })),
      }),
    }
  )
  .get(
    "/admins",
    async ({ headers, jwt, set }) => {
      try { await requirePlatformActor(headers, jwt, "admins:read"); }
      catch (err: any) { set.status = err.status ?? 401; return { success: false, error: err.message }; }

      const admins = await prisma.platformAdmin.findMany({
        orderBy: { createdAt: "desc" },
        select: { id: true, username: true, name: true, role: true, createdAt: true },
      });
      return { success: true, data: admins };
    }
  )
  .post(
    "/admins",
    async ({ body, headers, jwt, set }) => {
      let creator;
      try { creator = await requirePlatformActor(headers, jwt, "admins:write"); }
      catch (err: any) { set.status = err.status ?? 401; return { success: false, error: err.message }; }

      // Only the platform owner can grant platform access at all.
      if (!can(creator.role, "admins:write")) { set.status = 403; return { success: false, error: "Only the platform owner can manage platform access." }; }

      if (body.username.trim().toLowerCase() === "hackden" && creator.username.toLowerCase() !== "hackden") {
        set.status = 403;
        return { success: false, error: "Only the hackden platform owner can reserve this username" };
      }

      // PLATFORM_OWNER grants access + irreversible governance; the more
      // privileged target roles can only be granted by an owner, and an owner
      // cannot be self-demoted to a lower role (identical promotion is fine).
      if (body.role && creator.role !== "PLATFORM_OWNER") {
        set.status = 403;
        return { success: false, error: "Only the platform owner can assign roles." };
      }

      const existing = await prisma.platformAdmin.findUnique({ where: { username: body.username } });
      if (existing) { set.status = 409; return { success: false, error: "Username already taken" }; }

      const lockedHash = await Bun.password.hash(crypto.randomUUID());
      const formattedPhone = formatPhone(body.phone);

      const admin = await prisma.$transaction(async (tx) => {
        const created = await tx.platformAdmin.create({
          data: { username: body.username, passwordHash: lockedHash, name: body.name, role: (body.role as any) ?? "PLATFORM_OPERATIONS" },
        });

        const { rawToken } = await createPasswordSetupToken(created.id, "PLATFORM_ADMIN");

        await tx.eventOutbox.create({
          data: {
            eventName: "platform_admin_created",
            payload: JSON.stringify({
              platformAdminId: created.id,
              name: created.name,
              username: created.username,
              phone: formattedPhone,
              setupToken: rawToken,
              createdBy: creator.name,
            }),
            status: "initialized",
          },
        });

        await writeAudit(tx, creator, "admin", created.id, "create_admin_access", `Created platform admin "${created.name}" (@${created.username}) with role ${created.role}`);
        return { created, setupToken: rawToken };
      });

      return {
        success: true,
        data: { id: admin.created.id, username: admin.created.username, name: admin.created.name, role: admin.created.role, setupLink: buildSetupLink(admin.setupToken) },
      };
    },
    {
      body: t.Object({
        username: t.String({ minLength: 3 }),
        name: t.String({ minLength: 1 }),
        phone: t.String({ minLength: 10, maxLength: 13 }),
        role: t.Optional(t.Union([t.Literal("PLATFORM_OWNER"), t.Literal("PLATFORM_OPERATIONS"), t.Literal("PLATFORM_SUPPORT"), t.Literal("PLATFORM_AUDITOR")])),
      }),
    }
  )
  .patch(
    "/admins/:id/role",
    async ({ params, body, headers, jwt, set }) => {
      let actor;
      try { actor = await requirePlatformActor(headers, jwt, "admins:write"); }
      catch (err: any) { set.status = err.status ?? 401; return { success: false, error: err.message }; }

      if (actor.role !== "PLATFORM_OWNER") { set.status = 403; return { success: false, error: "Only the platform owner can change platform roles." }; }
      const target = await prisma.platformAdmin.findUnique({ where: { id: params.id } });
      if (!target) { set.status = 404; return { success: false, error: "Platform admin not found" }; }
      if (target.id === actor.id) { set.status = 400; return { success: false, error: "You cannot change your own role." }; }

      const updated = await prisma.$transaction(async (tx) => {
        const result = await tx.platformAdmin.update({ where: { id: params.id }, data: { role: body.role } });
        await writeAudit(tx, actor, "admin", params.id, "change_admin_access", `Changed ${target.name}'s platform role from ${target.role} to ${body.role}`);
        return result;
      });
      return { success: true, data: updated };
    },
    {
      params: t.Object({ id: t.String({ format: "uuid" }) }),
      body: t.Object({ role: t.Union([t.Literal("PLATFORM_OWNER"), t.Literal("PLATFORM_OPERATIONS"), t.Literal("PLATFORM_SUPPORT"), t.Literal("PLATFORM_AUDITOR")]) }),
    }
  )
  .delete(
    "/admins/:id",
    async ({ params, headers, jwt, set }) => {
      let remover;
      try { remover = await requirePlatformActor(headers, jwt, "admins:write"); }
      catch (err: any) { set.status = err.status ?? 401; return { success: false, error: err.message }; }

      if (remover.role !== "PLATFORM_OWNER") { set.status = 403; return { success: false, error: "Only the platform owner can remove platform administrators." }; }

      const target = await prisma.platformAdmin.findUnique({ where: { id: params.id } });
      if (!target) { set.status = 404; return { success: false, error: "Platform admin not found" }; }
      if (target.id === remover.id) { set.status = 400; return { success: false, error: "You cannot remove yourself" }; }
      if (remover.username.toLowerCase() !== "hackden") { set.status = 403; return { success: false, error: "Only the hackden platform owner can remove platform administrators" }; }

      await prisma.$transaction(async (tx) => {
        await tx.platformAdmin.delete({ where: { id: params.id } });
        await writeAudit(tx, remover, "admin", params.id, "remove_admin_access", `Removed platform admin "${target.name}" (@${target.username})`);
      });
      return { success: true, data: { removed: target.name } };
    },
    { params: t.Object({ id: t.String({ format: "uuid" }) }) }
  )
  .patch(
    "/outbox/:id/retry",
    async ({ params, headers, jwt, set }) => {
      try { await requirePlatformActor(headers, jwt, "outbox:retry"); }
      catch (err: any) { set.status = err.status ?? 401; return { success: false, error: err.message }; }

      const entry = await prisma.eventOutbox.findUnique({ where: { id: params.id } });
      if (!entry) { set.status = 404; return { success: false, error: "Outbox entry not found" }; }

      await prisma.eventOutbox.update({
        where: { id: params.id },
        data: { status: "initialized", attempts: 0, deliveryChecks: 0, deliveryRetryCount: 0, lastError: null, providerStatus: null, providerMessageId: null, completedAt: null, nextAttemptAt: new Date() },
      });

      return { success: true, data: { retried: entry.id } };
    },
    { params: t.Object({ id: t.String({ format: "uuid" }) }) }
  )
  .get(
    "/audit",
    async ({ headers, jwt, set, query }) => {
      try { await requirePlatformActor(headers, jwt, "audit:read"); }
      catch (err: any) { set.status = err.status ?? 401; return { success: false, error: err.message }; }

      // Combined audit: SMS-relevant outbox events (existing hotel surface) plus
      // the durable AuditLog rows written by platform actions.
      const eventNames: any[] = ["hotel_created", "hotel_status_updated", "hotel_admin_created"];
      const outboxWhere: any = { eventName: { in: eventNames } };
      if (query.hotelId) outboxWhere.hotelId = query.hotelId;

      const [outbox, auditRows] = await Promise.all([
        prisma.eventOutbox.findMany({ where: outboxWhere, orderBy: { createdAt: "desc" }, take: 100 }),
        prisma.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 100 }),
      ]);

      const combined = [
        ...outbox.map((r) => ({ id: r.id, createdAt: r.createdAt.toISOString(), action: r.eventName, entity: "hotel", actorName: r.payload ? (() => { try { return JSON.parse(r.payload).createdBy ?? ""; } catch { return ""; } })() : "", detail: r.payload || "", source: "outbox" })),
        ...auditRows.map((r) => ({ id: r.id, createdAt: r.createdAt.toISOString(), action: r.action, entity: r.entity, actorName: r.actorName, detail: r.detail, source: "auditlog" })),
      ].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).slice(0, 150);

      return { success: true, data: combined };
    },
    { query: t.Object({ hotelId: t.Optional(t.String()) }) }
  )
  .get(
    "/outbox",
    async ({ headers, jwt, set, query }) => {
      try { await requirePlatformActor(headers, jwt, "outbox:retry"); }
      catch (err: any) { set.status = err.status ?? 401; return { success: false, error: err.message }; }

      const where: any = {};
      if ((query as any).failed === "true") where.status = "failed";

      const rows = await prisma.eventOutbox.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: 50,
      });

      return { success: true, data: rows.map((r) => ({ ...r, payload: JSON.parse(r.payload) })) };
    }
  );