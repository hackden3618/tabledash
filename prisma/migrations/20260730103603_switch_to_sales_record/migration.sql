-- CreateEnum
CREATE TYPE "SalesRecordType" AS ENUM ('ORDER_CHARGE', 'ORDER_PAYMENT', 'REFUND', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'MPESA', 'CREDIT');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('WALLET_CREDIT', 'WALLET_PAYMENT');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "EventName" ADD VALUE 'customer_account_credited';
ALTER TYPE "EventName" ADD VALUE 'customer_account_payment_recorded';

-- DropForeignKey
ALTER TABLE "media" DROP CONSTRAINT "media_hotel_id_fkey";

-- DropIndex
DROP INDEX "media_created_at_idx";

-- DropIndex
DROP INDEX "media_hotel_id_idx";

-- DropIndex
DROP INDEX "media_status_idx";

-- AlterTable
ALTER TABLE "media" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "updated_at" DROP DEFAULT;

-- CreateTable
CREATE TABLE "sales_records" (
    "id" UUID NOT NULL,
    "hotel_id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "type" "SalesRecordType" NOT NULL,
    "paymentMethod" "PaymentMethod" NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "note" TEXT,
    "created_by_admin_user_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sales_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_accounts" (
    "id" UUID NOT NULL,
    "hotel_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "total_owed" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "total_paid" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "last_updated" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "customer_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "hotel_id" UUID NOT NULL,
    "order_id" UUID,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sales_records_hotel_id_created_at_idx" ON "sales_records"("hotel_id", "created_at");

-- CreateIndex
CREATE INDEX "sales_records_order_id_idx" ON "sales_records"("order_id");

-- CreateIndex
CREATE UNIQUE INDEX "customer_accounts_hotel_id_customer_id_key" ON "customer_accounts"("hotel_id", "customer_id");

-- CreateIndex
CREATE INDEX "notifications_customer_id_read_idx" ON "notifications"("customer_id", "read");

-- AddForeignKey
ALTER TABLE "media" ADD CONSTRAINT "media_hotel_id_fkey" FOREIGN KEY ("hotel_id") REFERENCES "hotels"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_records" ADD CONSTRAINT "sales_records_hotel_id_fkey" FOREIGN KEY ("hotel_id") REFERENCES "hotels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_records" ADD CONSTRAINT "sales_records_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_accounts" ADD CONSTRAINT "customer_accounts_hotel_id_fkey" FOREIGN KEY ("hotel_id") REFERENCES "hotels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_accounts" ADD CONSTRAINT "customer_accounts_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
