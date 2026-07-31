CREATE TYPE "ZoneType" AS ENUM ('MARKET', 'BUS_STATION', 'OFFICE_BUILDING', 'RESIDENTIAL', 'OTHER');

CREATE TABLE "zones" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "type" "ZoneType" NOT NULL,
    "location_label" TEXT NOT NULL,
    "location_placeholder" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "zones_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "zones_active_name_idx" ON "zones"("active", "name");
ALTER TABLE "hotels" ADD COLUMN "zone_id" UUID;

INSERT INTO "zones" ("id", "name", "type", "location_label", "location_placeholder")
VALUES ('00000000-0000-0000-0000-000000000001', 'General delivery area', 'OTHER', 'Delivery point', 'e.g. building, landmark or shop name');

UPDATE "hotels" SET "zone_id" = '00000000-0000-0000-0000-000000000001' WHERE "zone_id" IS NULL;
ALTER TABLE "hotels" ALTER COLUMN "zone_id" SET NOT NULL;
ALTER TABLE "hotels" ADD CONSTRAINT "hotels_zone_id_fkey" FOREIGN KEY ("zone_id") REFERENCES "zones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "hotels_zone_id_idx" ON "hotels"("zone_id");
