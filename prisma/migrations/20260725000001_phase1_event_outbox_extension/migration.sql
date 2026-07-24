-- Phase 1: Event-driven core — extend EventOutbox

-- AlterEnum: EventName
ALTER TYPE "EventName" ADD VALUE IF NOT EXISTS 'order_status_updated' AFTER 'order_created';
ALTER TYPE "EventName" ADD VALUE IF NOT EXISTS 'menu_availability_updated' AFTER 'order_status_updated';
ALTER TYPE "EventName" ADD VALUE 'order_payment_updated' AFTER 'menu_availability_updated';
ALTER TYPE "EventName" ADD VALUE 'hotel_created' AFTER 'menu_availability_updated';
ALTER TYPE "EventName" ADD VALUE 'hotel_status_updated' AFTER 'hotel_created';
ALTER TYPE "EventName" ADD VALUE 'hotel_admin_created' AFTER 'hotel_status_updated';
ALTER TYPE "EventName" ADD VALUE 'hotel_staff_created' AFTER 'hotel_admin_created';

-- AlterEnum: EventStatus
ALTER TYPE "EventStatus" ADD VALUE 'failed' AFTER 'done';

-- AlterTable: event_outbox
ALTER TABLE "event_outbox" ADD COLUMN IF NOT EXISTS "attempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "event_outbox" ADD COLUMN IF NOT EXISTS "hotel_id" UUID;
ALTER TABLE "event_outbox" ADD COLUMN IF NOT EXISTS "last_error" TEXT;
CREATE INDEX IF NOT EXISTS "event_outbox_status_idx" ON "event_outbox"("status");
