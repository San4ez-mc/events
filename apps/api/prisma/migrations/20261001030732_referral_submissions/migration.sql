-- CreateEnum
CREATE TYPE "ReferralSubmissionStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "referral_submissions" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "eventId" UUID,
    "note" TEXT,
    "status" "ReferralSubmissionStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedByAdminId" UUID,
    "reviewedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "referral_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "referral_submissions_status_idx" ON "referral_submissions"("status");

-- AddForeignKey
ALTER TABLE "referral_submissions" ADD CONSTRAINT "referral_submissions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referral_submissions" ADD CONSTRAINT "referral_submissions_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referral_submissions" ADD CONSTRAINT "referral_submissions_reviewedByAdminId_fkey" FOREIGN KEY ("reviewedByAdminId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
