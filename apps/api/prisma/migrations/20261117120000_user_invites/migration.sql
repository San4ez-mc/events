-- AlterTable
ALTER TABLE "users" ADD COLUMN "referralCode" TEXT,
ADD COLUMN "referralClicks" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "referredAt" TIMESTAMP(3),
ADD COLUMN "referredById" UUID;

-- CreateIndex
CREATE UNIQUE INDEX "users_referralCode_key" ON "users"("referralCode");

-- CreateIndex
CREATE INDEX "users_referredById_idx" ON "users"("referredById");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_referredById_fkey" FOREIGN KEY ("referredById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
