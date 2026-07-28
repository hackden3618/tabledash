-- Add image_url to hotels table for hotel branding images
ALTER TABLE "hotels" ADD COLUMN IF NOT EXISTS "image_url" TEXT;
