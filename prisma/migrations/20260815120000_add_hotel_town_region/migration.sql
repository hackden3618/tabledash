-- Hotels now belong to a specific delivery sub-area (TownRegion) within their
-- town, not just the town (Zone) itself. This is what makes "nearby hotel"
-- fee exemptions and zone-level delivery pricing possible at the hotel level.
-- Platform admin onboarding/relocation now requires picking both.

ALTER TABLE "hotels" ADD COLUMN "town_region_id" UUID;

-- Backfill: every existing hotel starts in its town's protected fallback
-- ("General Area") region. This preserves current behavior exactly — every
-- hotel keeps being treated as "not nearby" to anyone until a platform admin
-- assigns its real zone from the geography workspace.
UPDATE "hotels" h
SET "town_region_id" = tr.id
FROM "town_regions" tr
WHERE tr."town_id" = h."zone_id" AND tr."is_fallback" = true AND h."town_region_id" IS NULL;

-- Guard: fail loudly instead of leaving rows silently null if any town is
-- somehow missing its protected fallback region (would violate the NOT NULL
-- below with no explanation).
DO $$
DECLARE missing_count INT;
BEGIN
  SELECT COUNT(*) INTO missing_count FROM "hotels" WHERE "town_region_id" IS NULL;
  IF missing_count > 0 THEN
    RAISE EXCEPTION 'Backfill incomplete: % hotel(s) belong to a town with no fallback TownRegion. Fix before deploying.', missing_count;
  END IF;
END $$;

ALTER TABLE "hotels" ALTER COLUMN "town_region_id" SET NOT NULL;

-- RESTRICT, not CASCADE/SET NULL: a delivery zone that is still a hotel's
-- home base must not be deletable out from under it. Admin must relocate the
-- hotel first.
ALTER TABLE "hotels"
  ADD CONSTRAINT "hotels_town_region_id_fkey"
    FOREIGN KEY ("town_region_id") REFERENCES "town_regions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "hotels_town_region_id_idx" ON "hotels"("town_region_id");
