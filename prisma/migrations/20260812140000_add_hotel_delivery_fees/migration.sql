ALTER TABLE "hotels"
  ADD COLUMN "generic_delivery_fee" DECIMAL(10,2) NOT NULL DEFAULT 50;

ALTER TABLE "orders"
  ADD COLUMN "delivery_fee" DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN "delivery_zone_id" UUID;

CREATE TABLE "hotel_delivery_fees" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "hotel_id" UUID NOT NULL,
  "zone_id" UUID NOT NULL,
  "amount" DECIMAL(10,2) NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "hotel_delivery_fees_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "hotel_delivery_fees_hotel_id_zone_id_key" UNIQUE ("hotel_id", "zone_id"),
  CONSTRAINT "hotel_delivery_fees_hotel_id_fkey" FOREIGN KEY ("hotel_id") REFERENCES "hotels"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "hotel_delivery_fees_zone_id_fkey" FOREIGN KEY ("zone_id") REFERENCES "zones"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
