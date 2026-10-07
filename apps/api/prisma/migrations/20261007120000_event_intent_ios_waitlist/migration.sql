-- CreateTable
CREATE TABLE "event_intents" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "eventId" UUID NOT NULL,
    "showAsParticipant" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_intents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ios_waitlist" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "source" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ios_waitlist_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "event_intents_eventId_idx" ON "event_intents"("eventId");

-- CreateIndex
CREATE UNIQUE INDEX "event_intents_userId_eventId_key" ON "event_intents"("userId", "eventId");

-- CreateIndex
CREATE UNIQUE INDEX "ios_waitlist_email_key" ON "ios_waitlist"("email");

-- AddForeignKey
ALTER TABLE "event_intents" ADD CONSTRAINT "event_intents_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_intents" ADD CONSTRAINT "event_intents_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
