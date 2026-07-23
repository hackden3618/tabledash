/**
 * Purpose: Shared Prisma Client singleton for tableDash.
 * Responsibilities: Constructs a single PrismaClient instance wired to the PostgreSQL
 *   driver adapter using the DATABASE_URL from the shared environment config.
 * Dependencies: @prisma/adapter-pg, generated Prisma client, shared/config env singleton.
 * When to modify: When switching database drivers or adding Prisma logging options.
 */

import { PrismaClient } from "../../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { env } from "../../shared/config";

const url = env.databaseUrl;
if (!url) {
  throw new Error("DATABASE_URL is not set");
}

export const prisma = new PrismaClient({
  adapter: new PrismaPg(url),
});
