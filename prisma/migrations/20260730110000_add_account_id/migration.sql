-- Add account_id column (nullable initially for existing rows)
ALTER TABLE "customers" ADD COLUMN "account_id" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "customers_account_id_key" ON "customers"("account_id");

-- Make non-nullable after backfill
ALTER TABLE "customers" ALTER COLUMN "account_id" SET NOT NULL;
