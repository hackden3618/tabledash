CREATE TABLE "town_regions" (
  "id" UUID NOT NULL,
  "town_id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "town_regions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "town_regions_town_id_name_key" ON "town_regions"("town_id", "name");
CREATE INDEX "town_regions_town_id_active_name_idx" ON "town_regions"("town_id", "active", "name");
ALTER TABLE "town_regions" ADD CONSTRAINT "town_regions_town_id_fkey" FOREIGN KEY ("town_id") REFERENCES "zones"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Preserve current operations: every existing town gets a general delivery
-- region, ready for admins to add specific markets and stages afterwards.
INSERT INTO "town_regions" ("id", "town_id", "name")
SELECT gen_random_uuid(), "id", 'General delivery area' FROM "zones"
ON CONFLICT ("town_id", "name") DO NOTHING;
