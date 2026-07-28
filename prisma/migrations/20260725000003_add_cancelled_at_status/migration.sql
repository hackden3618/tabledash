-- AlterTable: orders
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "cancelled_at_status" TEXT;
