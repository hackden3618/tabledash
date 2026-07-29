-- v1.3.0 communication module: guest identity and durable conversations.
-- All tables are additive; existing order, customer, and tenant data is preserved.

DO $$ BEGIN
    CREATE TYPE "ConversationType" AS ENUM ('DIRECT', 'GROUP', 'HOTEL_ANNOUNCEMENT', 'GLOBAL_ANNOUNCEMENT', 'SUPPORT');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE "ParticipantKind" AS ENUM ('CUSTOMER', 'GUEST', 'HOTEL_STAFF', 'PLATFORM_ADMIN');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "guest_identities" (
    "id" UUID NOT NULL,
    "customer_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "guest_identities_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "guest_identities_customer_id_idx" ON "guest_identities"("customer_id");
DO $$ BEGIN
    ALTER TABLE "guest_identities" ADD CONSTRAINT "guest_identities_customer_id_fkey"
      FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "conversations" (
    "id" UUID NOT NULL,
    "type" "ConversationType" NOT NULL,
    "hotel_id" UUID,
    "title" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_message_at" TIMESTAMPTZ,
    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "conversations_hotel_id_idx" ON "conversations"("hotel_id");
CREATE INDEX IF NOT EXISTS "conversations_type_hotel_id_idx" ON "conversations"("type", "hotel_id");

CREATE TABLE IF NOT EXISTS "conversation_participants" (
    "id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "kind" "ParticipantKind" NOT NULL,
    "customer_id" UUID,
    "guest_identity_id" UUID,
    "admin_user_id" UUID,
    "platform_admin_id" UUID,
    "can_reply" BOOLEAN NOT NULL DEFAULT true,
    "last_read_at" TIMESTAMPTZ,
    CONSTRAINT "conversation_participants_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "conversation_participants_conversation_id_fkey"
      FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "conversation_participants_customer_id_idx" ON "conversation_participants"("customer_id");
CREATE INDEX IF NOT EXISTS "conversation_participants_guest_identity_id_idx" ON "conversation_participants"("guest_identity_id");
CREATE INDEX IF NOT EXISTS "conversation_participants_admin_user_id_idx" ON "conversation_participants"("admin_user_id");
CREATE INDEX IF NOT EXISTS "conversation_participants_platform_admin_id_idx" ON "conversation_participants"("platform_admin_id");
DO $$ BEGIN
    ALTER TABLE "conversation_participants" ADD CONSTRAINT "conversation_participants_conversation_id_customer_id_guest_identity_id_admin_user_id_platform_admin_id_key"
      UNIQUE ("conversation_id", "customer_id", "guest_identity_id", "admin_user_id", "platform_admin_id");
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "messages" (
    "id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "sender_participant_id" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "messages_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "messages_conversation_id_fkey"
      FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "messages_conversation_id_created_at_idx" ON "messages"("conversation_id", "created_at");
