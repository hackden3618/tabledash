-- Additive staff login link. Existing staff recipient rows remain valid.
ALTER TABLE "staff_users" ADD COLUMN IF NOT EXISTS "admin_user_id" UUID;
CREATE UNIQUE INDEX IF NOT EXISTS "staff_users_admin_user_id_key" ON "staff_users"("admin_user_id");
DO $$ BEGIN
  ALTER TABLE "staff_users" ADD CONSTRAINT "staff_users_admin_user_id_fkey"
    FOREIGN KEY ("admin_user_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
