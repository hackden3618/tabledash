-- DropForeignKey
ALTER TABLE "admin_users" DROP CONSTRAINT "admin_users_hotel_id_fkey";

-- DropForeignKey
ALTER TABLE "media" DROP CONSTRAINT "media_hotel_id_fkey";

-- DropForeignKey
ALTER TABLE "orders" DROP CONSTRAINT "orders_hotel_id_fkey";

-- DropForeignKey
ALTER TABLE "products" DROP CONSTRAINT "products_hotel_id_fkey";

-- DropForeignKey
ALTER TABLE "staff_users" DROP CONSTRAINT "staff_users_hotel_id_fkey";

-- DropIndex
DROP INDEX "hotels_zone_id_idx";

-- DropIndex
DROP INDEX "staff_users_phone_key";

-- AlterTable
ALTER TABLE "product_reviews" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "restaurant_reviews" ALTER COLUMN "updated_at" DROP DEFAULT;

-- CreateIndex
CREATE UNIQUE INDEX "staff_users_phone_hotel_id_key" ON "staff_users"("phone", "hotel_id");

-- AddForeignKey
ALTER TABLE "admin_users" ADD CONSTRAINT "admin_users_hotel_id_fkey" FOREIGN KEY ("hotel_id") REFERENCES "hotels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_hotel_id_fkey" FOREIGN KEY ("hotel_id") REFERENCES "hotels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_hotel_id_fkey" FOREIGN KEY ("hotel_id") REFERENCES "hotels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media" ADD CONSTRAINT "media_hotel_id_fkey" FOREIGN KEY ("hotel_id") REFERENCES "hotels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_users" ADD CONSTRAINT "staff_users_hotel_id_fkey" FOREIGN KEY ("hotel_id") REFERENCES "hotels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

