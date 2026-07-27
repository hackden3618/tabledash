/**
 * Purpose: Initial database seeder for tableDash.
 * Responsibilities: Seeds default hotel, platform admin, hotel admin, menu items, and staff phone setting.
 * Dependencies: Prisma database client, Bun.password API.
 * When to modify: When adding default data or updating initial credentials.
 */

import { env } from "../../shared/config";
import { formatPhone } from "../../shared/phone";
import { prisma } from "../../infrastructure/database/prisma";

export const seedDatabase = async () => {
    console.log("[Seeder] Seeding default data...");

    const platformAdminUsername = env.seedAdminUsername;
    const platformAdminPassword = env.seedAdminPassword;

    if (!platformAdminUsername || !platformAdminPassword) {
        throw new Error(
            "[Seeder] SEED_ADMIN_USERNAME and SEED_ADMIN_PASSWORD must be set in environment"
        );
    }

    // ── Default Hotel ──
    let hotel = await prisma.hotel.findFirst({ where: { deletedAt: null } });
    if (!hotel) {
        hotel = await prisma.hotel.create({
            data: {
                name: "Wambu's Corner Hotel",
                slug: "wambus-corner-hotel",
                isOpen: true,
            },
        });
        console.log(`[Seeder] Created default hotel: ${hotel.name}`);
    }

    // ── Platform Admin ──
    const existingPlatformAdmin = await prisma.platformAdmin.findFirst({
        where: { username: platformAdminUsername },
    });
    if (!existingPlatformAdmin) {
        const platformPasswordHash = await Bun.password.hash(platformAdminPassword);
        await prisma.platformAdmin.create({
            data: {
                username: platformAdminUsername,
                passwordHash: platformPasswordHash,
                name: "TableDash Platform Admin",
            },
        });
        console.log(`[Seeder] Created platform admin: ${platformAdminUsername}`);
    }

    // ── Hotel Admin (HOTEL_ADMIN) ──
    const existingAdminUser = await prisma.adminUser.findFirst({
        where: { hotelId: hotel.id, role: "HOTEL_ADMIN" },
    });
    if (!existingAdminUser) {
        const adminPasswordHash = await Bun.password.hash(platformAdminPassword);
        await prisma.adminUser.create({
            data: {
                username: "hotel_admin",
                passwordHash: adminPasswordHash,
                name: "Hotel Manager",
                hotelId: hotel.id,
                role: "HOTEL_ADMIN",
            },
        });
        console.log("[Seeder] Created hotel admin: hotel_admin /", platformAdminPassword);
    }

    // ── Default Products ──
    const defaultProducts = [
        {
            name: "Rice & Beans",
            category: "Meals",
            imageUrl: "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=400&q=80",
            price: 100,
            available: true,
            stockQty: 50,
        },
        {
            name: "Chapati",
            category: "Sides",
            imageUrl: "https://images.unsplash.com/photo-1565557623262-b51c2513a641?auto=format&fit=crop&w=400&q=80",
            price: 25,
            available: true,
            stockQty: 100,
        },
        {
            name: "Tea",
            category: "Beverages",
            imageUrl: "https://images.unsplash.com/photo-1576092768241-dec231879fc3?auto=format&fit=crop&w=400&q=80",
            price: 25,
            available: true,
            stockQty: 200,
        },
        {
            name: "Sukuma Wiki",
            category: "Sides",
            imageUrl: "https://images.unsplash.com/photo-1540420773420-3366772f4999?auto=format&fit=crop&w=400&q=80",
            price: 50,
            available: true,
            stockQty: 40,
        },
        {
            name: "Ugali & Beef",
            category: "Meals",
            imageUrl: "https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=400&q=80",
            price: 150,
            available: true,
            stockQty: 30,
        },
    ];

    for (const prod of defaultProducts) {
        const existing = await prisma.product.findFirst({
            where: { name: prod.name, hotelId: hotel.id },
        });
        if (!existing) {
            await prisma.product.create({
                data: { ...prod, hotelId: hotel.id, lastRestockedAt: new Date() },
            });
            console.log(`[Seeder] Created product: ${prod.name}`);
        }
    }

    // ── Staff Phone Setting (legacy fallback) ──
    const existingStaffPhone = await prisma.setting.findUnique({
        where: { key: "staff_phone" },
    });
    if (!existingStaffPhone) {
        const formattedSeedPhone = formatPhone("0757030743");
        await prisma.setting.create({
            data: { key: "staff_phone", value: formattedSeedPhone },
        });
        console.log("[Seeder] Created staff phone setting: " + formattedSeedPhone);
    }

    console.log("[Seeder] Database seeding completed successfully!");
};

// Execute seeder if called directly via CLI
if (import.meta.main) {
    seedDatabase()
        .catch((err) => {
            console.error("[Seeder Error]:", err);
            process.exit(1);
        })
        .finally(async () => {
            await prisma.$disconnect();
        });
}
