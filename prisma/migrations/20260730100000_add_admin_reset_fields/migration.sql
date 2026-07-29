-- Additive rollout: persists admin reset challenges across process restarts.
ALTER TABLE "admin_users"
  ADD COLUMN IF NOT EXISTS "reset_code" TEXT,
  ADD COLUMN IF NOT EXISTS "reset_code_expires" TIMESTAMPTZ;
