ALTER TYPE "EventName" ADD VALUE IF NOT EXISTS 'review_prompt_ready';

-- Fires exactly once per order, the moment it is both DELIVERED and PAID —
-- whichever of the two transitions completes second claims it atomically.
ALTER TABLE "orders" ADD COLUMN "review_prompt_sent_at" TIMESTAMPTZ;
