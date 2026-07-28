-- AlterTable
ALTER TABLE "customers" ADD COLUMN     "pin_reset_code" TEXT,
ADD COLUMN     "pin_reset_code_expires" TIMESTAMPTZ;
