-- CreateEnum
CREATE TYPE "SubscriptionTier" AS ENUM ('STARTER', 'PRO');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('ACTIVE', 'GRACE_PERIOD', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SubscriptionProvider" AS ENUM ('GOOGLE_PLAY', 'ADMIN_GRANT');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "subscriptionExpiresAt" TIMESTAMP(3),
ADD COLUMN     "subscriptionTier" "SubscriptionTier";

-- CreateTable
CREATE TABLE "platform_subscriptions" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "tier" "SubscriptionTier" NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'ACTIVE',
    "provider" "SubscriptionProvider" NOT NULL,
    "purchaseToken" TEXT,
    "productId" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "autoRenewing" BOOLEAN NOT NULL DEFAULT false,
    "lastCreditGrantPeriod" TEXT,
    "grantedByAdminId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platform_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "platform_subscriptions_purchaseToken_key" ON "platform_subscriptions"("purchaseToken");

-- CreateIndex
CREATE INDEX "platform_subscriptions_userId_status_idx" ON "platform_subscriptions"("userId", "status");

-- AddForeignKey
ALTER TABLE "platform_subscriptions" ADD CONSTRAINT "platform_subscriptions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform_subscriptions" ADD CONSTRAINT "platform_subscriptions_grantedByAdminId_fkey" FOREIGN KEY ("grantedByAdminId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
