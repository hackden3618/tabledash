-- Add MediaStatus enum
DO $$ BEGIN
    CREATE TYPE "MediaStatus" AS ENUM ('UPLOADING', 'PROCESSING', 'READY', 'FAILED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Create media table
CREATE TABLE IF NOT EXISTS "media" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "original_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "url" TEXT NOT NULL,
    "thumbnail_url" TEXT,
    "width" INTEGER,
    "height" INTEGER,
    "status" "MediaStatus" NOT NULL DEFAULT 'UPLOADING',
    "hotel_id" UUID REFERENCES "hotels"(id),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "deleted_at" TIMESTAMPTZ,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "media_hotel_id_idx" ON "media"("hotel_id");
CREATE INDEX IF NOT EXISTS "media_status_idx" ON "media"("status");
CREATE INDEX IF NOT EXISTS "media_created_at_idx" ON "media"("created_at");