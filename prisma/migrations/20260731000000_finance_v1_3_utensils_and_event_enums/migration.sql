-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'WALLET_REFUND';
ALTER TYPE "NotificationType" ADD VALUE 'WALLET_ADJUSTMENT';

-- AlterEnum
ALTER TYPE "EventName" ADD VALUE 'customer_account_refund_recorded';
ALTER TYPE "EventName" ADD VALUE 'customer_account_adjusted';

-- AlterTable
ALTER TABLE "orders" ADD COLUMN "utensils_issued" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "utensils_returned_at" TIMESTAMPTZ,
ADD COLUMN "utensils_returned_by_admin_user_id" UUID;
