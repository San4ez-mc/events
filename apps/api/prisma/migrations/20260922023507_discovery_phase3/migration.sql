-- CreateEnum
CREATE TYPE "InteractionType" AS ENUM ('PASS', 'OPEN');

-- AlterTable
ALTER TABLE "user_preferences" ADD COLUMN     "freeOnly" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "preferredCategoryIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "preferredCityId" UUID,
ADD COLUMN     "preferredDistrictIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "preferredFormat" "EventFormat";

-- CreateTable
CREATE TABLE "user_event_interactions" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "eventId" UUID NOT NULL,
    "interaction" "InteractionType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_event_interactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "saved_events" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "eventId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "saved_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "user_event_interactions_userId_interaction_createdAt_idx" ON "user_event_interactions"("userId", "interaction", "createdAt");

-- CreateIndex
CREATE INDEX "user_event_interactions_eventId_idx" ON "user_event_interactions"("eventId");

-- CreateIndex
CREATE INDEX "saved_events_userId_createdAt_idx" ON "saved_events"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "saved_events_userId_eventId_key" ON "saved_events"("userId", "eventId");

-- AddForeignKey
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_preferredCityId_fkey" FOREIGN KEY ("preferredCityId") REFERENCES "cities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_event_interactions" ADD CONSTRAINT "user_event_interactions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_event_interactions" ADD CONSTRAINT "user_event_interactions_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_events" ADD CONSTRAINT "saved_events_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_events" ADD CONSTRAINT "saved_events_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
