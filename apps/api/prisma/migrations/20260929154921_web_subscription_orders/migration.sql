-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "SubscriptionProvider" ADD VALUE 'WAYFORPAY';
ALTER TYPE "SubscriptionProvider" ADD VALUE 'MONO';

-- DropForeignKey
ALTER TABLE "platform_payment_orders" DROP CONSTRAINT "platform_payment_orders_packageId_fkey";

-- AlterTable
ALTER TABLE "platform_payment_orders" ADD COLUMN     "subscriptionTier" "SubscriptionTier",
ALTER COLUMN "packageId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "platform_payment_orders" ADD CONSTRAINT "platform_payment_orders_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "credit_packages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CheckConstraint: exactly one of packageId/subscriptionTier is set — a credit-package order xor a subscription-tier order.
ALTER TABLE "platform_payment_orders" ADD CONSTRAINT "platform_payment_orders_product_xor" CHECK (
  ("packageId" IS NOT NULL AND "subscriptionTier" IS NULL) OR ("packageId" IS NULL AND "subscriptionTier" IS NOT NULL)
);
