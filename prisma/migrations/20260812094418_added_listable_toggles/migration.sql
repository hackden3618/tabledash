-- CreateEnum
CREATE TYPE "PushOwnerType" AS ENUM ('CUSTOMER', 'ADMIN');

-- AlterTable
ALTER TABLE "hotels" ADD COLUMN     "is_listed" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "push_subscriptions" (
    "id" UUID NOT NULL,
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
CREATE UNIQUE INDEX "push_subscriptions_endpoint_key" ON "push_subscriptions"("endpoint");

-- CreateIndex
CREATE INDEX "push_subscriptions_owner_type_owner_id_idx" ON "push_subscriptions"("owner_type", "owner_id");

-- CreateIndex
CREATE INDEX "push_subscriptions_hotel_id_idx" ON "push_subscriptions"("hotel_id");
