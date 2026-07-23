/*
  Warnings:

  - You are about to drop the column `name` on the `customers` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[first_name,known_name,phone]` on the table `customers` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `first_name` to the `customers` table without a default value. This is not possible if the table is not empty.
  - Added the required column `known_name` to the `customers` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "customers" DROP COLUMN "name",
ADD COLUMN     "first_name" TEXT NOT NULL,
ADD COLUMN     "known_name" TEXT NOT NULL,
ADD COLUMN     "last_name" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "customers_first_name_known_name_phone_key" ON "customers"("first_name", "known_name", "phone");

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
