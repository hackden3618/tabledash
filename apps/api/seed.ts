/**
 * Purpose: Initial database seeder for tableDash.
 * Responsibilities: Seeds default menu items (Rice & Beans, Chapati, Tea, Sukuma Wiki) and initial admin user with hashed password.
 * Dependencies: Prisma database client, Bun.password API.
 * When to modify: When adding default menu items or updating initial admin credentials.
 */

import { env } from "../../shared/config";
import { prisma } from "../../infrastructure/database/prisma";

export const seedDatabase = async () => {
    console.log("[Seeder] Seeding default menu items and admin user...");

    // Seed default admin user
    const adminUsername = env.seedAdminUsername;
    const adminPassword = env.seedAdminPassword;

    if (!adminUsername || !adminPassword) {
        throw new Error(
            "[Seeder] SEED_ADMIN_USERNAME and SEED_ADMIN_PASSWORD must be set in environment"
        );
    }

    // Seed Platform Admin user
    const existingPlatformAdmin = await prisma.platformAdmin.findFirst({
        where: { username: "platform_admin" },
    });

    if (!existingPlatformAdmin) {
        const platformPasswordHash = await Bun.password.hash(adminPassword);
        await prisma.platformAdmin.create({
            data: {
                username: "platform_admin",
                passwordHash: platformPasswordHash,
                name: "TableDash Platform Admin",
            },
        });
        console.log(`[Seeder] Created default platform admin user: 'platform_admin'`);
    }

    const existingAdmin = await prisma.adminUser.findUnique({
        where: { username: adminUsername },
    });

    if (!existingAdmin) {
        // WHY: Using Bun.password.hash for secure password storage compliant with security guidelines
        const passwordHash = await Bun.password.hash(adminPassword);
        await prisma.adminUser.create({
            data: {
                username: adminUsername,
                passwordHash: passwordHash,
                name: "Wambu's Corner Hotel Admin",
                role: "HOTEL_ADMIN",
            },
        });
        console.log(`[Seeder] Created default admin user: '${adminUsername}'`);
    }

    // Seed default menu products matching reference visual design
    const defaultProducts = [
        {
            name: "Rice & Beans",
            category: "Meals",
            imageUrl: "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=400&q=80",
            price: 100,
            available: true,
        },
        {
            name: "Chapati",
            category: "Sides",
            imageUrl: "https://images.unsplash.com/photo-1565557623262-b51c2513a641?auto=format&fit=crop&w=400&q=80",
            price: 20,
            available: true,
        },
        {
            name: "Tea",
            category: "Beverages",
            imageUrl: "https://images.unsplash.com/photo-1576092768241-dec231879fc3?auto=format&fit=crop&w=400&q=80",
            price: 30,
            available: true,
        },
        {
            name: "Sukuma Wiki",
            category: "Sides",
            imageUrl: "https://images.unsplash.com/photo-1540420773420-3366772f4999?auto=format&fit=crop&w=400&q=80",
            price: 50,
            available: true,
        },
        {
            name: "Ugali & Beef",
            category: "Meals",
            imageUrl: "https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=400&q=80",
            price: 150,
            available: true,
        },
    ];

    for (const prod of defaultProducts) {
        const existing = await prisma.product.findFirst({
            where: { name: prod.name },
        });
        if (!existing) {
            await prisma.product.create({
                data: prod,
            });
            console.log(`[Seeder] Created product: ${prod.name}`);
        }
    }

    // Seed default hotel staff phone setting
    const existingStaffPhone = await prisma.setting.findUnique({
        where: { key: "staff_phone" },
    });
    if (!existingStaffPhone) {
        await prisma.setting.create({
            data: {
                key: "staff_phone",
                value: "0712345678",
            },
        });
        console.log("[Seeder] Created default hotel staff phone setting: 0712345678");
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
