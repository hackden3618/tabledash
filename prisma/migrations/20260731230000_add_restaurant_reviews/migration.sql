CREATE TABLE "restaurant_reviews" (
    "id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "hotel_id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "restaurant_reviews_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "restaurant_reviews_order_id_key" ON "restaurant_reviews"("order_id");
CREATE INDEX "restaurant_reviews_hotel_id_created_at_idx" ON "restaurant_reviews"("hotel_id", "created_at");
ALTER TABLE "restaurant_reviews" ADD CONSTRAINT "restaurant_reviews_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "restaurant_reviews" ADD CONSTRAINT "restaurant_reviews_hotel_id_fkey" FOREIGN KEY ("hotel_id") REFERENCES "hotels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "restaurant_reviews" ADD CONSTRAINT "restaurant_reviews_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
