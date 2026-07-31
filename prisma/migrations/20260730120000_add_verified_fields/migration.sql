-- AlterTable
ALTER TABLE "customers" ADD COLUMN "verified_at" TIMESTAMPTZ;
ALTER TABLE "customers" ADD COLUMN "registration_otp" TEXT;
ALTER TABLE "customers" ADD COLUMN "registration_otp_expires" TIMESTAMPTZ;
