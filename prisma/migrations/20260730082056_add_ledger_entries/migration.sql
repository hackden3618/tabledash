-- CreateEnum
CREATE TYPE "LedgerEntryType" AS ENUM ('ORDER_CHARGE', 'CASH_PAYMENT', 'PARTIAL_PAYMENT', 'REFUND', 'CREDIT_ADJUSTMENT', 'MANUAL_ADJUSTMENT', 'FUTURE_ONLINE_PAYMENT');

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
CREATE TABLE "ledger_entries" (
    "id" UUID NOT NULL,
    "hotel_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "order_id" UUID,
    "type" "LedgerEntryType" NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "balance" DECIMAL(10,2) NOT NULL,
    "description" TEXT,
    "reference" TEXT,
    "created_by" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ledger_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ledger_entries_hotel_id_customer_id_idx" ON "ledger_entries"("hotel_id", "customer_id");

-- CreateIndex
CREATE INDEX "ledger_entries_created_at_idx" ON "ledger_entries"("created_at");

-- AddForeignKey
ALTER TABLE "media" ADD CONSTRAINT "media_hotel_id_fkey" FOREIGN KEY ("hotel_id") REFERENCES "hotels"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_hotel_id_fkey" FOREIGN KEY ("hotel_id") REFERENCES "hotels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
