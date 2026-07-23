/*
  Warnings:

  - You are about to drop the column `time` on the `orders` table. All the data in the column will be lost.
  - Added the required column `completed_at` to the `event_outbox` table without a default value. This is not possible if the table is not empty.
  - Added the required column `completed_at` to the `orders` table without a default value. This is not possible if the table is not empty.
  - Added the required column `image_url` to the `products` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "event_outbox" ADD COLUMN     "completed_at" TIMESTAMPTZ NOT NULL,
ADD COLUMN     "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "orders" DROP COLUMN "time",
ADD COLUMN     "completed_at" TIMESTAMPTZ NOT NULL,
ADD COLUMN     "ordered_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "image_url" TEXT NOT NULL;
