-- CreateEnum
CREATE TYPE "ListingCreditType" AS ENUM ('GRANT', 'PURCHASE', 'EVENT_PUBLICATION', 'REFUND', 'ADMIN_ADJUSTMENT', 'PROMO');

-- CreateEnum
CREATE TYPE "ModerationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ModerationReasonCode" AS ENUM ('SENSITIVE_KEYWORDS', 'WAR_RELATED', 'ADULT_CONTENT', 'USER_REPORTED', 'MANUAL_REVIEW');

-- CreateTable
CREATE TABLE "listing_credit_ledger" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "type" "ListingCreditType" NOT NULL,
    "creditsDelta" INTEGER NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "listing_credit_ledger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credit_packages" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "credits" INTEGER NOT NULL,
    "price" DECIMAL(10,2) NOT NULL,
    "currency" "Currency" NOT NULL DEFAULT 'UAH',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "credit_packages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "moderation_cases" (
    "id" UUID NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "reasonCode" "ModerationReasonCode" NOT NULL,
    "details" TEXT,
    "status" "ModerationStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "resolvedByAdminId" UUID,

    CONSTRAINT "moderation_cases_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "listing_credit_ledger_userId_idx" ON "listing_credit_ledger"("userId");

-- CreateIndex
CREATE INDEX "listing_credit_ledger_sourceType_sourceId_idx" ON "listing_credit_ledger"("sourceType", "sourceId");

-- CreateIndex
CREATE INDEX "moderation_cases_targetType_targetId_idx" ON "moderation_cases"("targetType", "targetId");

-- CreateIndex
CREATE INDEX "moderation_cases_status_idx" ON "moderation_cases"("status");

-- AddForeignKey
ALTER TABLE "listing_credit_ledger" ADD CONSTRAINT "listing_credit_ledger_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "moderation_cases" ADD CONSTRAINT "moderation_cases_resolvedByAdminId_fkey" FOREIGN KEY ("resolvedByAdminId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

