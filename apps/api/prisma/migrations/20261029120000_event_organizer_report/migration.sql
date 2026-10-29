-- AlterTable
ALTER TABLE "events" ADD COLUMN "reportPromptedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "event_organizer_reports" (
    "id" UUID NOT NULL,
    "eventId" UUID NOT NULL,
    "authorId" UUID NOT NULL,
    "comment" TEXT,
    "registeredCount" INTEGER NOT NULL,
    "attendedCount" INTEGER NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "event_organizer_reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "event_organizer_reports_eventId_key" ON "event_organizer_reports"("eventId");

-- CreateIndex
CREATE INDEX "event_organizer_reports_submittedAt_idx" ON "event_organizer_reports"("submittedAt");

-- AddForeignKey
ALTER TABLE "event_organizer_reports" ADD CONSTRAINT "event_organizer_reports_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'EVENT_REPORT_REQUEST';
