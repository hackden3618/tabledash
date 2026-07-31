-- Tighten hotelId to NOT NULL on Product, Order, Media, StaffUser
ALTER TABLE "products" ALTER COLUMN "hotel_id" SET NOT NULL;
ALTER TABLE "orders" ALTER COLUMN "hotel_id" SET NOT NULL;
ALTER TABLE "media" ALTER COLUMN "hotel_id" SET NOT NULL;
ALTER TABLE "staff_users" ALTER COLUMN "hotel_id" SET NOT NULL;
