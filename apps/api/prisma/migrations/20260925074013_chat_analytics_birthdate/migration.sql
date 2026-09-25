-- CreateEnum
CREATE TYPE "AnalyticsAction" AS ENUM ('IMPRESSION', 'VIEW', 'SAVE', 'UNSAVE', 'SHARE', 'REGISTRATION_STARTED', 'REGISTERED', 'CANCELLED', 'PAYMENT_LINK_CLICK', 'SUBSCRIBED');

-- CreateEnum
CREATE TYPE "TrafficSource" AS ENUM ('SWIPE', 'SEARCH', 'DIRECT', 'PROFILE', 'THREADS', 'OTHER');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "birthDate" DATE;

-- CreateTable
CREATE TABLE "event_chat_messages" (
    "id" UUID NOT NULL,
    "eventId" UUID NOT NULL,
    "authorId" UUID NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_chat_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_analytics_events" (
    "id" UUID NOT NULL,
    "eventId" UUID NOT NULL,
    "userId" UUID,
    "sessionId" TEXT,
    "action" "AnalyticsAction" NOT NULL,
    "source" "TrafficSource",
    "metadataJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_analytics_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_daily_stats" (
    "eventId" UUID NOT NULL,
    "date" DATE NOT NULL,
    "impressions" INTEGER NOT NULL DEFAULT 0,
    "views" INTEGER NOT NULL DEFAULT 0,
    "saves" INTEGER NOT NULL DEFAULT 0,
    "shares" INTEGER NOT NULL DEFAULT 0,
    "registrationStarts" INTEGER NOT NULL DEFAULT 0,
    "registrations" INTEGER NOT NULL DEFAULT 0,
    "confirmed" INTEGER NOT NULL DEFAULT 0,
    "cancellations" INTEGER NOT NULL DEFAULT 0,
    "paymentClicks" INTEGER NOT NULL DEFAULT 0,
    "viewsBySource" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "event_daily_stats_pkey" PRIMARY KEY ("eventId","date")
);

-- CreateIndex
CREATE INDEX "event_chat_messages_eventId_createdAt_idx" ON "event_chat_messages"("eventId", "createdAt");

-- CreateIndex
CREATE INDEX "event_analytics_events_eventId_createdAt_idx" ON "event_analytics_events"("eventId", "createdAt");

-- CreateIndex
CREATE INDEX "event_analytics_events_eventId_action_idx" ON "event_analytics_events"("eventId", "action");

-- AddForeignKey
ALTER TABLE "event_chat_messages" ADD CONSTRAINT "event_chat_messages_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_chat_messages" ADD CONSTRAINT "event_chat_messages_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_analytics_events" ADD CONSTRAINT "event_analytics_events_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_analytics_events" ADD CONSTRAINT "event_analytics_events_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_daily_stats" ADD CONSTRAINT "event_daily_stats_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
