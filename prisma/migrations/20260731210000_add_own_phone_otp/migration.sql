ALTER TABLE "customers"
  ADD COLUMN "own_phone_otp" TEXT,
  ADD COLUMN "own_phone_otp_expires" TIMESTAMPTZ,
  ADD COLUMN "phone_confirmed_at" TIMESTAMPTZ;