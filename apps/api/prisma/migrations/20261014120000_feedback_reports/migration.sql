-- CreateEnum
CREATE TYPE "FeedbackReportStatus" AS ENUM ('NEW', 'RESOLVED');

-- CreateTable
CREATE TABLE "feedback_reports" (
    "id" UUID NOT NULL,
    "userId" UUID,
    "message" TEXT NOT NULL,
    "screenshotUrl" TEXT,
    "context" TEXT,
    "platform" TEXT,
    "appVersion" TEXT,
    "buildNumber" INTEGER,
    "device" TEXT,
    "status" "FeedbackReportStatus" NOT NULL DEFAULT 'NEW',
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "feedback_reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "feedback_reports_status_createdAt_idx" ON "feedback_reports"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "feedback_reports" ADD CONSTRAINT "feedback_reports_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
