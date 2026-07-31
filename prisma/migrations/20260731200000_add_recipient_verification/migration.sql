-- On-behalf orders: the recipient's phone number must be OTP-verified before
-- the order can be placed, so nobody can attribute an order to another person's
-- number without that person receiving the verification SMS.
ALTER TABLE "customers" ADD COLUMN "recipient_verify_otp" TEXT;
ALTER TABLE "customers" ADD COLUMN "recipient_verify_otp_expires" TIMESTAMPTZ;
ALTER TABLE "customers" ADD COLUMN "recipient_verified_at" TIMESTAMPTZ;
