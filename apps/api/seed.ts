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

    const defaultZone = await prisma.zone.upsert({
        where: { id: "00000000-0000-0000-0000-000000000001" },
        update: {},
        create: {
            id: "00000000-0000-0000-0000-000000000001",
            name: "General delivery area",
            type: "OTHER",
            locationLabel: "Delivery point",
            locationPlaceholder: "e.g. building, landmark, stall number e.g stall 93 or shop name",
        },
    });

    // ── Default Hotel ──
    let hotel = await prisma.hotel.findFirst({ where: { deletedAt: null } });
    if (!hotel) {
        hotel = await prisma.hotel.create({
            data: {
                name: "Wambu's Corner Hotel",
                slug: "wambus-corner-hotel",
                isOpen: true,
                zoneId: defaultZone.id,
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
            imageUrl: "https://imgs.search.brave.com/V01g5c6dAV7VYGxH81c0_UrOAUse_7Fxj7eNastxAzI/rs:fit:500:0:1:0/g:ce/aHR0cHM6Ly9iZWxs/eWZ1bGwubmV0L3dw/LWNvbnRlbnQvdXBs/b2Fkcy8yMDIxLzAz/L1JpY2UtYW5kLUJl/YW5zLWJsb2ctMi5q/cGc",
            price: 100,
            available: true,
            stockQty: 50,
        },
        {
            name: "Chapati/ Chapo - white",
            category: "Sides",
            imageUrl: "https://imgs.search.brave.com/vJ7avchCCvkMD3C16BELaiTcrCxNX0EfL_j8kAIEGdE/rs:fit:500:0:1:0/g:ce/aHR0cHM6Ly9pLnBp/bmltZy5jb20vb3Jp/Z2luYWxzL2UyLzA0/LzhkL2UyMDQ4ZGJl/ZDc4NTM0YzhjYTNh/ZjQ2ZWRlN2ZjNzRk/LmpwZw",
            price: 25,
            available: true,
            stockQty: 100,
        },
        {
            name: "Tea",
            category: "Beverages",
            imageUrl: "https://imgs.search.brave.com/DRGS9lPXx7FyREROyg7wKfCA2hjp3SpO3BIPWh4mfMg/rs:fit:500:0:1:0/g:ce/aHR0cHM6Ly9pLnBp/bmltZy5jb20vb3Jp/Z2luYWxzL2Q1Lzc5/L2I4L2Q1NzliODk0/ZDI5NzkxNzczNDk1/ZWNjYjUzYmM5YzQx/LmpwZw",
            price: 25,
            available: true,
            stockQty: 200,
        },
        {
            name: "Ugali & Beef",
            category: "Meals",
            imageUrl: "https://imgs.search.brave.com/PQ4V_vpylREnQUMN7kyH7cirP6W0HApP9obRhgKU0CU/rs:fit:500:0:1:0/g:ce/aHR0cHM6Ly9wcmV2/aWV3LnJlZGQuaXQv/a2VueWFuLWRpc2gt/aG9tZS1tYWRlLWJl/ZWYtc2F1dCVDMyVB/OWVkLXZlZ2dpZXMt/dWdhbGktYWZyaWNh/bi12MC1qbWtuMTRh/bzNvaWQxLnBuZz93/aWR0aD02NDAmY3Jv/cD1zbWFydCZhdXRv/PXdlYnAmcz0wZjRi/YmUwMWUxNDgwYjE3/MmRmNjJiMGVmNGRl/NTRiYTIwZjkyNzI1",
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
