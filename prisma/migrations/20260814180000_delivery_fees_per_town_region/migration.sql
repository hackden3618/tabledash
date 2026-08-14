-- Migrate hotel_delivery_fees from Zone-scoped to TownRegion-scoped.
-- Delivery fees are now configured per sub-area (TownRegion) within the hotel's
-- town, not per town (Zone). This lets a hotel admin set different fees for
-- Sokoni Modern Market, Bus Stage, General Delivery Area, etc. inside their town.

-- 1. Drop existing constraint and foreign key to zones.
ALTER TABLE "hotel_delivery_fees"
  DROP CONSTRAINT IF EXISTS "hotel_delivery_fees_hotel_id_zone_id_key",
  DROP CONSTRAINT IF EXISTS "hotel_delivery_fees_zone_id_fkey";

-- 2. Drop old zone_id column and add town_region_id column.
ALTER TABLE "hotel_delivery_fees"
  DROP COLUMN "zone_id",
  ADD COLUMN "town_region_id" UUID NOT NULL DEFAULT gen_random_uuid();

-- 3. Wipe existing rows — they referenced zones (towns), which are incompatible
--    with the new TownRegion scope. Admins will re-configure per-area fees.
DELETE FROM "hotel_delivery_fees";

-- 4. Add the new FK and unique constraint.
ALTER TABLE "hotel_delivery_fees"
  ADD CONSTRAINT "hotel_delivery_fees_town_region_id_fkey"
    FOREIGN KEY ("town_region_id") REFERENCES "town_regions"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "hotel_delivery_fees_hotel_id_town_region_id_key"
    UNIQUE ("hotel_id", "town_region_id");

-- 5. Remove the DEFAULT used only for the migration step.
ALTER TABLE "hotel_delivery_fees"
  ALTER COLUMN "town_region_id" DROP DEFAULT;
