-- Geography workspace + platform roles
-- 1) TownRegion gains operational note, display order, and an explicit fallback
--    marker so "General Area" is protected by rule, not by naming convention.
-- 2) PlatformAdmin gains a role for least-privilege platform access.
-- 3) A durable AuditLog table records every sensitive platform action (geography
--    mutations, reclassifications, access changes) in the action's transaction.
-- 4) A temporary GeographyReclassification queue supports the legacy-cleanup
--    workflow for Zone records that were mis-named before town_regions existed.

CREATE TYPE "PlatformRole" AS ENUM ('PLATFORM_OWNER', 'PLATFORM_OPERATIONS', 'PLATFORM_SUPPORT', 'PLATFORM_AUDITOR');

ALTER TABLE "platform_admins"
  ADD COLUMN "role" "PlatformRole" NOT NULL DEFAULT 'PLATFORM_OPERATIONS';

ALTER TABLE "town_regions"
  ADD COLUMN "note" TEXT,
  ADD COLUMN "display_order" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "is_fallback" BOOLEAN NOT NULL DEFAULT false;

-- Backfill: the auto-seeded general fallback name produced by both the current
-- code ("General Area") and the original backfill ("General delivery area") is
-- protected. Any row carrying that name IS the town's fallback.
UPDATE "town_regions" SET "is_fallback" = true
WHERE "name" ILIKE 'General Area%' OR "name" = 'General delivery area';

CREATE TABLE "audit_logs" (
  "id" UUID NOT NULL,
  "actor_id" UUID NOT NULL,
  "actor_name" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "entity" TEXT NOT NULL,
  "entity_id" UUID,
  "detail" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "audit_logs_entity_entity_id_idx" ON "audit_logs"("entity", "entity_id");
CREATE INDEX "audit_logs_action_idx" ON "audit_logs"("action");
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");

CREATE TABLE "geography_reclassifications" (
  "id" UUID NOT NULL,
  "source_zone_id" UUID NOT NULL,
  "source_name" TEXT NOT NULL,
  "proposed_town_id" UUID NOT NULL,
  "proposed_town_name" TEXT NOT NULL,
  "area_name" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "created_by_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "applied_at" TIMESTAMPTZ,
  "applies_to" INTEGER NOT NULL DEFAULT 0,
  "rejected_count" INTEGER NOT NULL DEFAULT 0,
  "error" TEXT,
  CONSTRAINT "geography_reclassifications_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "geography_reclassifications_status_idx" ON "geography_reclassifications"("status");