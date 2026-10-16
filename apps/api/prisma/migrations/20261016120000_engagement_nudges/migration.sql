-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'SHARE_PROMPT';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'DRAFT_REMINDER';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'WEEKLY_DIGEST';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'ACCOUNT_REMINDER';

-- CreateTable
CREATE TABLE "event_reminder_requests" (
    "id" UUID NOT NULL,
    "eventId" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_reminder_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "event_reminder_requests_token_key" ON "event_reminder_requests"("token");

-- CreateIndex
CREATE UNIQUE INDEX "event_reminder_requests_eventId_email_key" ON "event_reminder_requests"("eventId", "email");

-- CreateIndex
CREATE INDEX "event_reminder_requests_sentAt_createdAt_idx" ON "event_reminder_requests"("sentAt", "createdAt");

-- AddForeignKey
ALTER TABLE "event_reminder_requests" ADD CONSTRAINT "event_reminder_requests_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
