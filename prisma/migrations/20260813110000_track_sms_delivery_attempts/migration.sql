ALTER TABLE "event_outbox"
  ADD COLUMN "next_attempt_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "provider_message_id" TEXT,
  ADD COLUMN "provider_status" TEXT;

CREATE INDEX "event_outbox_status_next_attempt_at_idx"
  ON "event_outbox"("status", "next_attempt_at");
