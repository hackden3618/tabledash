CREATE TYPE "MegaRegionType" AS ENUM ('COUNTY', 'CITY', 'OTHER');

CREATE TABLE "mega_regions" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "type" "MegaRegionType" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "mega_regions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "mega_regions_name_type_key" ON "mega_regions"("name", "type");
CREATE INDEX "mega_regions_active_name_idx" ON "mega_regions"("active", "name");

ALTER TABLE "zones" ADD COLUMN "mega_region_id" UUID;

INSERT INTO "mega_regions" ("id", "name", "type")
SELECT gen_random_uuid(), 'Nakuru County', 'COUNTY'::"MegaRegionType"
WHERE NOT EXISTS (
    SELECT 1 FROM "mega_regions" WHERE "name" = 'Nakuru County' AND "type" = 'COUNTY'::"MegaRegionType"
);

UPDATE "zones"
SET "mega_region_id" = (
    SELECT "id" FROM "mega_regions"
    WHERE "name" = 'Nakuru County' AND "type" = 'COUNTY'::"MegaRegionType"
    LIMIT 1
)
WHERE "mega_region_id" IS NULL;

-- This was the original single platform-wide delivery area. It is now the
-- actual town boundary for the existing Naivasha hotels, rather than a vague
-- catch-all that leaves customers unable to find their local hotels.
UPDATE "hotels"
SET "zone_id" = target."id"
FROM "zones" legacy
JOIN "zones" target
  ON target."name" = 'Naivasha Town'
 AND target."mega_region_id" = legacy."mega_region_id"
WHERE "hotels"."zone_id" = legacy."id"
  AND legacy."name" = 'General delivery area';

UPDATE "zones"
SET "name" = 'Naivasha Town'
WHERE "name" = 'General delivery area'
  AND "mega_region_id" = (
    SELECT "id" FROM "mega_regions"
    WHERE "name" = 'Nakuru County' AND "type" = 'COUNTY'::"MegaRegionType"
    LIMIT 1
  )
  AND NOT EXISTS (
    SELECT 1 FROM "zones" existing
    WHERE existing."name" = 'Naivasha Town'
      AND existing."mega_region_id" = "zones"."mega_region_id"
  );

-- If a Naivasha Town was already configured, retire the legacy empty choice
-- after moving any hotels to it above.
UPDATE "zones"
SET "active" = false
WHERE "name" = 'General delivery area'
  AND "mega_region_id" = (
    SELECT "id" FROM "mega_regions"
    WHERE "name" = 'Nakuru County' AND "type" = 'COUNTY'::"MegaRegionType"
    LIMIT 1
  );

ALTER TABLE "zones" ALTER COLUMN "mega_region_id" SET NOT NULL;
ALTER TABLE "zones" ADD CONSTRAINT "zones_mega_region_id_fkey"
    FOREIGN KEY ("mega_region_id") REFERENCES "mega_regions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE UNIQUE INDEX "zones_mega_region_id_name_key" ON "zones"("mega_region_id", "name");
CREATE INDEX "zones_mega_region_id_active_name_idx" ON "zones"("mega_region_id", "active", "name");
