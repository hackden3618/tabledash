-- Privacy-first user discovery. Existing users remain hidden until they opt in.
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "is_discoverable" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "admin_users" ADD COLUMN IF NOT EXISTS "is_discoverable" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "staff_users" ADD COLUMN IF NOT EXISTS "is_discoverable" BOOLEAN NOT NULL DEFAULT false;
