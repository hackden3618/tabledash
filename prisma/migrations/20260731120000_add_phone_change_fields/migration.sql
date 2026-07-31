-- Add the phone-change verification fields that were in schema.prisma but
-- never had a migration written. All three are nullable — phone change is
-- opt-in and pending state is transient.
-- AlterTable
ALTER TABLE "customers" ADD COLUMN "phone_change_otp" TEXT,
ADD COLUMN "phone_change_otp_expires" TIMESTAMPTZ,
ADD COLUMN "phone_change_pending" TEXT;
