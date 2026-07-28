-- Phase 3: Tenant isolation — Hotel, PlatformAdmin, hotelId FKs, AdminUser.role

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- CreateEnum
CREATE TYPE "HotelRole" AS ENUM ('HOTEL_ADMIN', 'HOTEL_STAFF');

-- CreateTable: hotels
CREATE TABLE "hotels" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "is_open" BOOLEAN NOT NULL DEFAULT true,
    "auto_close_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ,
    CONSTRAINT "hotels_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "hotels_slug_key" ON "hotels"("slug");

-- CreateTable: platform_admins
CREATE TABLE "platform_admins" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "username" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "platform_admins_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "platform_admins_username_key" ON "platform_admins"("username");

-- Seed default hotel
INSERT INTO "hotels" ("id", "name", "slug", "is_open")
SELECT gen_random_uuid(), 'Wambu''s Corner Hotel', 'wambus-corner-hotel', true
WHERE NOT EXISTS (SELECT 1 FROM "hotels" LIMIT 1);

-- AlterTable: admin_users
ALTER TABLE "admin_users" ADD COLUMN IF NOT EXISTS "hotel_id" UUID;
ALTER TABLE "admin_users" ADD COLUMN IF NOT EXISTS "role" "HotelRole" NOT NULL DEFAULT 'HOTEL_STAFF';
ALTER TABLE "admin_users" ADD CONSTRAINT "admin_users_hotel_id_fkey" FOREIGN KEY ("hotel_id") REFERENCES "hotels"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable: products
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "hotel_id" UUID;
ALTER TABLE "products" ADD CONSTRAINT "products_hotel_id_fkey" FOREIGN KEY ("hotel_id") REFERENCES "hotels"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable: orders
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "hotel_id" UUID;
ALTER TABLE "orders" ADD CONSTRAINT "orders_hotel_id_fkey" FOREIGN KEY ("hotel_id") REFERENCES "hotels"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable: staff_users
ALTER TABLE "staff_users" ADD COLUMN IF NOT EXISTS "hotel_id" UUID;
ALTER TABLE "staff_users" ADD CONSTRAINT "staff_users_hotel_id_fkey" FOREIGN KEY ("hotel_id") REFERENCES "hotels"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill hotelId on existing rows
UPDATE "admin_users" SET "hotel_id" = (SELECT "id" FROM "hotels" LIMIT 1) WHERE "hotel_id" IS NULL;
UPDATE "products" SET "hotel_id" = (SELECT "id" FROM "hotels" LIMIT 1) WHERE "hotel_id" IS NULL;
UPDATE "orders" SET "hotel_id" = (SELECT "id" FROM "hotels" LIMIT 1) WHERE "hotel_id" IS NULL;
UPDATE "staff_users" SET "hotel_id" = (SELECT "id" FROM "hotels" LIMIT 1) WHERE "hotel_id" IS NULL;

-- Set the first admin_user as HOTEL_ADMIN
UPDATE "admin_users" SET "role" = 'HOTEL_ADMIN' WHERE "id" = (SELECT "id" FROM "admin_users" ORDER BY "created_at" ASC LIMIT 1);

-- Normalize existing phone numbers to 254XXXXXXXXX format for TextSMS gateway
UPDATE "customers" SET "phone" = '254' || SUBSTRING("phone" FROM 2) WHERE "phone" ~ '^0[0-9]{9}$';
UPDATE "staff_users" SET "phone" = '254' || SUBSTRING("phone" FROM 2) WHERE "phone" ~ '^0[0-9]{9}$';
UPDATE "settings" SET "value" = '254' || SUBSTRING("value" FROM 2) WHERE "key" = 'staff_phone' AND "value" ~ '^0[0-9]{9}$';
