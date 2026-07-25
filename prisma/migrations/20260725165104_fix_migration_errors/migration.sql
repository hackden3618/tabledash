/*
  Warnings:

  - You are about to drop the column `known_name` on the `customers` table. All the data in the column will be lost.
  - You are about to drop the column `location` on the `customers` table. All the data in the column will be lost.
  - You are about to drop the column `orderId` on the `order_items` table. All the data in the column will be lost.
  - You are about to drop the column `completed` on the `orders` table. All the data in the column will be lost.
  - You are about to alter the column `price` on the `products` table. The data in that column could be lost. The data in that column will be cast from `Decimal(65,30)` to `Decimal(10,2)`.
  - A unique constraint covering the columns `[phone]` on the table `customers` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `payload` to the `event_outbox` table without a default value. This is not possible if the table is not empty.
  - Added the required column `order_id` to the `order_items` table without a default value. This is not possible if the table is not empty.
  - Added the required column `subtotal` to the `order_items` table without a default value. This is not possible if the table is not empty.
  - Added the required column `unit_price` to the `order_items` table without a default value. This is not possible if the table is not empty.
  - Added the required column `total_amount` to the `orders` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('NEW', 'ACCEPTED', 'PREPARING', 'READY_FOR_DELIVERY', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED');

-- DropForeignKey
ALTER TABLE "order_items" DROP CONSTRAINT "order_items_orderId_fkey";

-- DropIndex
DROP INDEX "customers_first_name_known_name_phone_key";

-- AlterTable
ALTER TABLE "admin_users" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "customers" DROP COLUMN "known_name",
DROP COLUMN "location",
ADD COLUMN     "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "location_description" TEXT,
ADD COLUMN     "market_section" TEXT,
ADD COLUMN     "pin_hash" TEXT;

-- AlterTable
ALTER TABLE "event_outbox" ADD COLUMN     "payload" TEXT NOT NULL,
ALTER COLUMN "completed_at" DROP NOT NULL;

-- AlterTable
ALTER TABLE "hotels" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "order_items" DROP COLUMN "orderId",
ADD COLUMN     "order_id" UUID NOT NULL,
ADD COLUMN     "quantity" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "subtotal" DECIMAL(10,2) NOT NULL,
ADD COLUMN     "unit_price" DECIMAL(10,2) NOT NULL;

-- AlterTable
ALTER TABLE "orders" DROP COLUMN "completed",
ADD COLUMN     "cancel_reason" TEXT,
ADD COLUMN     "location_description" TEXT,
ADD COLUMN     "market_section" TEXT,
ADD COLUMN     "order_number" SERIAL NOT NULL,
ADD COLUMN     "status" "OrderStatus" NOT NULL DEFAULT 'NEW',
ADD COLUMN     "total_amount" DECIMAL(10,2) NOT NULL,
ALTER COLUMN "completed_at" DROP NOT NULL;

-- AlterTable
ALTER TABLE "platform_admins" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "category" TEXT NOT NULL DEFAULT 'General',
ADD COLUMN     "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "deleted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "stock_qty" INTEGER NOT NULL DEFAULT 0,
ALTER COLUMN "price" SET DATA TYPE DECIMAL(10,2),
ALTER COLUMN "available" SET DEFAULT true;

-- AlterTable
ALTER TABLE "staff_users" ALTER COLUMN "id" DROP DEFAULT;

-- CreateIndex
CREATE UNIQUE INDEX "customers_phone_key" ON "customers"("phone");

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
