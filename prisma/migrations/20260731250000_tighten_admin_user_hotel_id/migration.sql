-- Hotel staff accounts must always be tenant-scoped.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "admin_users" WHERE "hotel_id" IS NULL) THEN
    RAISE EXCEPTION 'Cannot make admin_users.hotel_id required: existing tenantless admin users must be assigned to a hotel first';
  END IF;
END $$;

ALTER TABLE "admin_users" ALTER COLUMN "hotel_id" SET NOT NULL;
