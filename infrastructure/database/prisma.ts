import { PrismaClient } from "../../generated/prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { Environment } from "../../shared/config"

const env = new Environment
const url = env.databaseUrl
if (!url) {
  throw new Error("DATABASE_URL is not set")
}

export const prisma = new PrismaClient({
  adapter: new PrismaPg(url),
})
