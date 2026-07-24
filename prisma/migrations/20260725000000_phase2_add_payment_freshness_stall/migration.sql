-- Phase 2: Data-integrity fixes
-- Payment tracking, freshness timestamps, stall number

-- CreateEnum: PaymentStatus
DO $$ BEGIN
    CREATE TYPE "PaymentStatus" AS ENUM ('UNPAID', 'PARTIAL', 'PAID');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- AlterTable: orders
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "payment_status" "PaymentStatus" NOT NULL DEFAULT 'UNPAID';
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "amount_paid" DECIMAL(10,2) NOT NULL DEFAULT 0;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "stall_number" TEXT;

-- AlterTable: customers
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "stall_number" TEXT;

-- AlterTable: products
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "last_restocked_at" TIMESTAMPTZ;
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "out_of_stock_since" TIMESTAMPTZ;
