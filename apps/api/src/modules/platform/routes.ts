import { jwt } from "@elysiajs/jwt";
import { Elysia, t } from "elysia";
import { env } from "../../../../../shared/config";
import { formatPhone, PHONE_PATTERN } from "../../../../../shared/phone";
import { getAllHotels, getHotelById } from "../hotels/service";
import { loginPlatformAdmin, verifyPlatformAdminToken } from "../auth/service";
import { prisma } from "../../../../../infrastructure/database/prisma";
import { AUTH_LIMITER } from "../../lib/rate-limiter";

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
  .get(
    "/dashboard",
    async ({ headers, jwt, set }) => {
      const { token, error } = extractToken(headers, jwt);
      if (error) { set.status = 401; return error; }
      try { await verifyPlatformAdminToken(token!, (t) => jwt.verify(t)); }
      catch { set.status = 401; return { success: false, error: "Invalid or expired platform session token" }; }

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
          platformBrand: "TableDash Deliveries",
        },
      };
    }
  )
  .get(
    "/hotels",
    async ({ headers, jwt, set, query }) => {
      const { token, error } = extractToken(headers, jwt);
      if (error) { set.status = 401; return error; }
      try { await verifyPlatformAdminToken(token!, (t) => jwt.verify(t)); }
      catch { set.status = 401; return { success: false, error: "Invalid or expired platform session token" }; }

      let hotels = await prisma.hotel.findMany({
        where: query.all === "true" ? {} : { deletedAt: null },
        orderBy: { createdAt: "desc" },
        include: {
          adminUsers: { select: { id: true, name: true, username: true, role: true } },
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
      const { token, error } = extractToken(headers, jwt);
      if (error) { set.status = 401; return error; }
      try { await verifyPlatformAdminToken(token!, (t) => jwt.verify(t)); }
      catch { set.status = 401; return { success: false, error: "Invalid or expired platform session token" }; }

      const hotel = await prisma.hotel.findUnique({
        where: { id: params.id },
        include: {
          adminUsers: { select: { id: true, name: true, username: true, role: true, createdAt: true } },
          staffUsers: { select: { id: true, name: true, phone: true, createdAt: true } },
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
      const { token, error } = extractToken(headers, jwt);
      if (error) { set.status = 401; return error; }
      let admin;
      try { admin = await verifyPlatformAdminToken(token!, (t) => jwt.verify(t)); }
      catch { set.status = 401; return { success: false, error: "Invalid or expired platform session token" }; }

      try {
        const tempPassword = crypto.randomUUID().split("-")[0]!;
        const passwordHash = await Bun.password.hash(tempPassword);
        const formattedAdminPhone = body.adminPhone ? formatPhone(body.adminPhone) : null;

        const result = await prisma.$transaction(async (tx) => {
          const hotel = await tx.hotel.create({
            data: {
              name: body.name,
              slug: body.slug,
              isOpen: body.isOpen ?? true,
              autoCloseAt: body.autoCloseAt ? new Date(body.autoCloseAt) : null,
            },
          });

          const adminUser = await tx.adminUser.create({
            data: {
              username: body.adminUsername,
              passwordHash,
              name: body.adminName,
              hotelId: hotel.id,
              role: "HOTEL_ADMIN",
            },
          });

          await tx.eventOutbox.create({
            data: {
              eventName: "hotel_created",
              payload: JSON.stringify({
                hotelId: hotel.id,
                hotelName: hotel.name,
                adminName: body.adminName,
                adminUsername: body.adminUsername,
                adminPhone: formattedAdminPhone,
                createdBy: admin.name,
              }),
              hotelId: hotel.id,
              status: "initialized",
            },
          });

          return { hotel, adminUser, tempPassword };
        });

        return {
          success: true,
          data: {
            hotel: result.hotel,
            adminUser: { id: result.adminUser.id, username: result.adminUser.username, name: result.adminUser.name },
            tempPassword: result.tempPassword,
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
        adminPhone: t.String({ minLength: 12, maxLength: 12, pattern: PHONE_PATTERN }),
        isOpen: t.Optional(t.Boolean()),
        autoCloseAt: t.Optional(t.String()),
      }),
    }
  )
  .patch(
    "/hotels/:id/toggle",
    async ({ params, headers, jwt, set }) => {
      const { token, error } = extractToken(headers, jwt);
      if (error) { set.status = 401; return error; }
      let admin;
      try { admin = await verifyPlatformAdminToken(token!, (t) => jwt.verify(t)); }
      catch { set.status = 401; return { success: false, error: "Invalid or expired platform session token" }; }

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
  .get(
    "/admins",
    async ({ headers, jwt, set }) => {
      const { token, error } = extractToken(headers, jwt);
      if (error) { set.status = 401; return error; }
      try { await verifyPlatformAdminToken(token!, (t) => jwt.verify(t)); }
      catch { set.status = 401; return { success: false, error: "Invalid or expired platform session token" }; }

      const admins = await prisma.platformAdmin.findMany({
        orderBy: { createdAt: "desc" },
        select: { id: true, username: true, name: true, createdAt: true },
      });
      return { success: true, data: admins };
    }
  )
  .post(
    "/admins",
    async ({ body, headers, jwt, set }) => {
      const { token, error } = extractToken(headers, jwt);
      if (error) { set.status = 401; return error; }
      let creator;
      try { creator = await verifyPlatformAdminToken(token!, (t) => jwt.verify(t)); }
      catch { set.status = 401; return { success: false, error: "Invalid or expired platform session token" }; }

      const existing = await prisma.platformAdmin.findUnique({ where: { username: body.username } });
      if (existing) { set.status = 409; return { success: false, error: "Username already taken" }; }

      const tempPassword = crypto.randomUUID().split("-")[0]!;
      const passwordHash = await Bun.password.hash(tempPassword);
      const formattedPhone = body.phone ? formatPhone(body.phone) : null;

      const admin = await prisma.platformAdmin.create({
        data: { username: body.username, passwordHash, name: body.name },
      });

      await prisma.eventOutbox.create({
        data: {
          eventName: "platform_admin_created",
          payload: JSON.stringify({
            platformAdminId: admin.id,
            name: admin.name,
            username: admin.username,
            phone: formattedPhone,
            createdBy: creator.name,
          }),
          status: "initialized",
        },
      });

      return {
        success: true,
        data: { id: admin.id, username: admin.username, name: admin.name, tempPassword },
      };
    },
    {
      body: t.Object({
        username: t.String({ minLength: 3 }),
        name: t.String({ minLength: 1 }),
        phone: t.Optional(t.String({ minLength: 12, maxLength: 12, pattern: PHONE_PATTERN })),
      }),
    }
  )
  .delete(
    "/admins/:id",
    async ({ params, headers, jwt, set }) => {
      const { token, error } = extractToken(headers, jwt);
      if (error) { set.status = 401; return error; }
      let remover;
      try { remover = await verifyPlatformAdminToken(token!, (t) => jwt.verify(t)); }
      catch { set.status = 401; return { success: false, error: "Invalid or expired platform session token" }; }

      const target = await prisma.platformAdmin.findUnique({ where: { id: params.id } });
      if (!target) { set.status = 404; return { success: false, error: "Platform admin not found" }; }
      if (target.id === remover.id) { set.status = 400; return { success: false, error: "You cannot remove yourself" }; }

      await prisma.platformAdmin.delete({ where: { id: params.id } });
      return { success: true, data: { removed: target.name } };
    },
    { params: t.Object({ id: t.String({ format: "uuid" }) }) }
  )
  .get(
    "/audit",
    async ({ headers, jwt, set, query }) => {
      const { token, error } = extractToken(headers, jwt);
      if (error) { set.status = 401; return error; }
      try { await verifyPlatformAdminToken(token!, (t) => jwt.verify(t)); }
      catch { set.status = 401; return { success: false, error: "Invalid or expired platform session token" }; }

      const eventNames: any[] = ["hotel_created", "hotel_status_updated", "hotel_admin_created"];
      const where: any = { eventName: { in: eventNames } };
      if (query.hotelId) where.hotelId = query.hotelId;

      const rows = await prisma.eventOutbox.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: 100,
      });

      return { success: true, data: rows.map((r) => ({ ...r, payload: JSON.parse(r.payload) })) };
    },
    { query: t.Object({ hotelId: t.Optional(t.String()) }) }
  )
  .get(
    "/outbox",
    async ({ headers, jwt, set, query }) => {
      const { token, error } = extractToken(headers, jwt);
      if (error) { set.status = 401; return error; }
      try { await verifyPlatformAdminToken(token!, (t) => jwt.verify(t)); }
      catch { set.status = 401; return { success: false, error: "Invalid or expired platform session token" }; }

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

function extractToken(headers: Record<string, string | undefined>, jwt: any) {
  const authHeader = headers["authorization"];
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return { token: null, error: { success: false, error: "Missing or invalid authorization header" } };
  }
  return { token: authHeader.split(" ")[1]!, error: null };
}
