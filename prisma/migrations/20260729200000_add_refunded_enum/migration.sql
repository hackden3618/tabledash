-- Add REFUNDED to PaymentStatus enum
ALTER TYPE "PaymentStatus" ADD VALUE IF NOT EXISTS 'REFUNDED';

-- Add refunded_at to orders
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "refunded_at" TIMESTAMPTZ;
