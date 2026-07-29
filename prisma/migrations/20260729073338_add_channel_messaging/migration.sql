-- Step 1: Delete DIRECT conversations (no personal DMs)
DELETE FROM "conversations" WHERE "type"::text = 'DIRECT';

-- Step 2: Add new columns
ALTER TABLE "conversations" ADD COLUMN "order_id" UUID;
ALTER TABLE "conversations" ADD COLUMN "channel_name" TEXT;
ALTER TABLE "conversations" ADD COLUMN "assigned_staff_id" UUID;

-- Step 3: Replace old ConversationType enum with new values, mapping old values during conversion
BEGIN;
CREATE TYPE "ConversationType_new" AS ENUM ('ORDER', 'TALK_TO_STAFF', 'HOTEL_NOTICE', 'PLATFORM_NOTICE', 'HOTEL_COMMUNITY');
ALTER TABLE "conversations" ALTER COLUMN "type" TYPE "ConversationType_new" USING (
  CASE "type"::text
    WHEN 'GROUP' THEN 'HOTEL_COMMUNITY'::text
    WHEN 'HOTEL_ANNOUNCEMENT' THEN 'HOTEL_NOTICE'::text
    WHEN 'GLOBAL_ANNOUNCEMENT' THEN 'PLATFORM_NOTICE'::text
    WHEN 'SUPPORT' THEN 'TALK_TO_STAFF'::text
    ELSE "type"::text
  END::"ConversationType_new"
);
ALTER TYPE "ConversationType" RENAME TO "ConversationType_old";
ALTER TYPE "ConversationType_new" RENAME TO "ConversationType";
DROP TYPE "public"."ConversationType_old";
COMMIT;

-- Step 4: Set channel_name for HOTEL_COMMUNITY conversations
UPDATE "conversations" SET "channel_name" = 'general' WHERE "type" = 'HOTEL_COMMUNITY' AND "channel_name" IS NULL;

-- Step 5: Add index and foreign key
CREATE INDEX "conversations_order_id_idx" ON "conversations"("order_id");
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
