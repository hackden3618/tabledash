-- CreateEnum for PushOwnerType if it doesn't exist
DO $$ BEGIN
    CREATE TYPE "PushOwnerType" AS ENUM ('CUSTOMER', 'ADMIN');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- AlterTable: Add is_listed to hotels
ALTER TABLE "hotels" ADD COLUMN IF NOT EXISTS "is_listed" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable: push_subscriptions
CREATE TABLE IF NOT EXISTS "push_subscriptions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "owner_type" "PushOwnerType" NOT NULL,
    "owner_id" UUID NOT NULL,
    "hotel_id" UUID,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "user_agent" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "push_subscriptions_endpoint_key" ON "push_subscriptions"("endpoint");
CREATE INDEX IF NOT EXISTS "push_subscriptions_owner_type_owner_id_idx" ON "push_subscriptions"("owner_type", "owner_id");
CREATE INDEX IF NOT EXISTS "push_subscriptions_hotel_id_idx" ON "push_subscriptions"("hotel_id");
