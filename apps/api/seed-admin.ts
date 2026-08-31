/**
 * Purpose: Minimal, idempotent platform-admin seeder for every deployed service.
 * Responsibilities: Ensures the platform admin (super-admin) login exists and
 *   has the password from SEED_ADMIN_PASSWORD. Runs on every service boot so a
 *   fresh deploy is always guaranteed a working admin login. Deliberately
 *   skips the default hotel / zone / product / staff-phone seeding — creating
 *   those requires a Hotel.townRegionId that only platform-admin onboarding
 *   sets up, and the legacy seeder drifted on it. Hotels are created through
 *   the platform dashboard after first login.
 * Dependencies: Prisma database client, Bun.password, shared/config.
 */

import { env } from "../../shared/config";
import { prisma } from "../../infrastructure/database/prisma";

export const seedAdminOnly = async () => {
    console.log("[Seeder] Ensuring platform admin...");

    const username = env.seedAdminUsername;
    const password = env.seedAdminPassword;
    if (!username || !password) {
        throw new Error("[Seeder] SEED_ADMIN_USERNAME and SEED_ADMIN_PASSWORD must be set in environment");
    }

    const passwordHash = await Bun.password.hash(password);

    const existing = await prisma.platformAdmin.findUnique({
        where: { username },
        select: { id: true },
    });

    if (existing) {
        // Always (re)set the password so a redeploy guarantees the expected
        // admin login is valid, regardless of previous state.
        await prisma.platformAdmin.update({
            where: { username },
            data: { passwordHash },
        });
        console.log(`[Seeder] Updated password for platform admin: ${username}`);
        return;
    }

    await prisma.platformAdmin.create({
        data: {
            username,
            passwordHash,
            name: "Ladha Platform Admin",
            role: "PLATFORM_OWNER",
        },
    });

    console.log(`[Seeder] Created platform admin: ${username}`);
};

// Execute seeder if called directly via CLI
if (import.meta.main) {
    seedAdminOnly()
        .catch((err) => {
            console.error("[Seeder Error]:", err);
            process.exit(1);
        })
        .finally(async () => {
            await prisma.$disconnect();
        });
}
