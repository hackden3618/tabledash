-- AlterTable: customer's selected delivery zone (finest tier). Nullable —
-- guests and not-yet-located customers simply have no preference set yet.
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "town_region_id" UUID;

-- AddForeignKey: ON DELETE SET NULL — if a platform admin ever deactivates
-- or removes a zone, customers who had it selected should fall back to
-- "no preference" (prompted to re-pick), never leave a dangling reference
-- or block the zone deletion outright.
DO $$ BEGIN
    ALTER TABLE "customers" ADD CONSTRAINT "customers_town_region_id_fkey"
      FOREIGN KEY ("town_region_id") REFERENCES "town_regions"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;
