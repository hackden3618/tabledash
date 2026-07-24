import { jwt } from "@elysiajs/jwt";
import { Elysia, t } from "elysia";
import { env } from "../../../../../shared/config";
import { getAllHotels } from "../hotels/service";
import { loginPlatformAdmin, verifyPlatformAdminToken } from "../auth/service";
import { prisma } from "../../../../../infrastructure/database/prisma";

export const platformRoute = new Elysia({
    prefix: `${env.apiPrefix}/platform`,
    detail: {
        summary: "Platform admin panel — hotel provisioning, audit, and outbox operations",
        tags: ["Platform"],
    },
})
    .use(
        jwt({
            name: "jwt",
            secret: env.jwtSecret,
        })
            // Platform Admin Login
            .post(
                "/login",
                async ({ body, jwt, set }) => {
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
                        username: t.String({ minLength: 1 }),
                        password: t.String({ minLength: 1 }),
                    }),
                }
            )
            .get(
                "/dashboard",
                async ({ headers, jwt, set }) => {
                    const authHeader = headers["authorization"];
                    if (!authHeader || !authHeader.startsWith("Bearer ")) {
                        set.status = 401;
                        return { success: false, error: "Missing or invalid authorization header" };
                    }
                    const token = authHeader.split(" ")[1] ?? "";
                    try {
                        await verifyPlatformAdminToken(token, (t) => jwt.verify(t));
                    } catch {
                        set.status = 401;
                        return { success: false, error: "Invalid or expired platform session token" };
                    }
                    const hotels = await getAllHotels();
                    const hotelCount = hotels.length;
                    const activeHotelCount = hotels.filter((h) => h.isOpen).length;
                    return {
                        success: true,
                        data: { hotelCount, activeHotelCount, platformBrand: "TableDash Deliveries" },
                    };
                }
            )
            .get(
                "/hotels",
                async ({ headers, jwt, set }) => {
                    const authHeader = headers["authorization"];
                    if (!authHeader || !authHeader.startsWith("Bearer ")) {
                        set.status = 401;
                        return { success: false, error: "Missing or invalid authorization header" };
                    }
                    const token = authHeader.split(" ")[1] ?? "";
                    try {
                        await verifyPlatformAdminToken(token, (t) => jwt.verify(t));
                    } catch {
                        set.status = 401;
                        return { success: false, error: "Invalid or expired platform session token" };
                    }
                    const hotels = await getAllHotels();
                    return { success: true, data: hotels };
                }
            )
            .post(
                "/hotels",
                async ({ body, headers, jwt, set }) => {
                    const authHeader = headers["authorization"];
                    if (!authHeader || !authHeader.startsWith("Bearer ")) {
                        set.status = 401;
                        return { success: false, error: "Missing or invalid authorization header" };
                    }
                    const token = authHeader.split(" ")[1] ?? "";
                    try {
                        await verifyPlatformAdminToken(token, (t) => jwt.verify(t));
                    } catch {
                        set.status = 401;
                        return { success: false, error: "Invalid or expired platform session token" };
                    }
                    try {
                        const tempPassword = crypto.randomUUID().split("-")[0] || "failedToGenerate";
                        const passwordHash = await Bun.password.hash(tempPassword);

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
                                        adminPhone: body.adminPhone,
                                        tempPassword,
                                    }),
                                    hotelId: hotel.id,
                                    status: "initialized",
                                },
                            });

                            await tx.eventOutbox.create({
                                data: {
                                    eventName: "hotel_admin_created",
                                    payload: JSON.stringify({
                                        adminUserId: adminUser.id,
                                        adminName: body.adminName,
                                        adminPhone: body.adminPhone,
                                        hotelName: hotel.name,
                                        tempPassword,
                                    }),
                                    hotelId: hotel.id,
                                    status: "initialized",
                                },
                            });

                            return { hotel, adminUser };
                        });

                        return {
                            success: true,
                            data: {
                                hotel: result.hotel,
                                adminUser: { id: result.adminUser.id, username: result.adminUser.username, name: result.adminUser.name },
                                tempPassword,
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
                        slug: t.String({ minLength: 1 }),
                        adminUsername: t.String({ minLength: 3 }),
                        adminName: t.String({ minLength: 1 }),
                        adminPhone: t.String({ minLength: 10 }),
                        isOpen: t.Optional(t.Boolean()),
                        autoCloseAt: t.Optional(t.String()),
                    }),
                }
            )
            .patch(
                "/hotels/:id/toggle",
                async ({ params, headers, jwt, set }) => {
                    const authHeader = headers["authorization"];
                    if (!authHeader || !authHeader.startsWith("Bearer ")) {
                        set.status = 401;
                        return { success: false, error: "Missing or invalid authorization header" };
                    }
                    const token = authHeader.split(" ")[1] ?? "";
                    try {
                        await verifyPlatformAdminToken(token, (t) => jwt.verify(t));
                    } catch {
                        set.status = 401;
                        return { success: false, error: "Invalid or expired platform session token" };
                    }
                    const hotel = await prisma.hotel.findUnique({ where: { id: params.id } });
                    if (!hotel) {
                        set.status = 404;
                        return { success: false, error: "Hotel not found" };
                    }
                    const updated = await prisma.hotel.update({
                        where: { id: params.id },
                        data: { isOpen: !hotel.isOpen },
                    });
                    return { success: true, data: updated };
                },
                {
                    params: t.Object({
                        id: t.String({ format: "uuid", error: "Invalid UUID parameter" }),
                    }),
                }
            )
            .get(
                "/outbox",
                async ({ headers, jwt, set, query }) => {
                    const authHeader = headers["authorization"];
                    if (!authHeader || !authHeader.startsWith("Bearer ")) {
                        set.status = 401;
                        return { success: false, error: "Missing or invalid authorization header" };
                    }
                    const token = authHeader.split(" ")[1] ?? "";
                    try {
                        await verifyPlatformAdminToken(token, (t) => jwt.verify(t));
                    } catch {
                        set.status = 401;
                        return { success: false, error: "Invalid or expired platform session token" };
                    }
                    const failedOnly = (query as any).failed;
                    const rows = await prisma.eventOutbox.findMany({
                        where: failedOnly === "true" ? { status: "failed" } : undefined,
                        orderBy: { createdAt: "desc" },
                        take: 50,
                    });
                    return { success: true, data: rows.map((r) => ({ ...r, payload: JSON.parse(r.payload) })) };
                }
            )
    )
