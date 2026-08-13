ALTER TYPE "EventStatus" ADD VALUE IF NOT EXISTS 'awaiting_delivery';
ALTER TYPE "EventStatus" ADD VALUE IF NOT EXISTS 'delivered';

ALTER TABLE "event_outbox"
  ADD COLUMN "delivery_checks" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "delivery_retry_count" INTEGER NOT NULL DEFAULT 0;
