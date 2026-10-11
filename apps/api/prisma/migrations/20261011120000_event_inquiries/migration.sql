-- CreateTable
CREATE TABLE "event_inquiries" (
    "id" UUID NOT NULL,
    "eventId" UUID NOT NULL,
    "askerId" UUID NOT NULL,
    "organizerId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_inquiries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inquiry_messages" (
    "id" UUID NOT NULL,
    "inquiryId" UUID NOT NULL,
    "senderId" UUID NOT NULL,
    "text" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inquiry_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "event_inquiries_askerId_lastMessageAt_idx" ON "event_inquiries"("askerId", "lastMessageAt");

-- CreateIndex
CREATE INDEX "event_inquiries_organizerId_lastMessageAt_idx" ON "event_inquiries"("organizerId", "lastMessageAt");

-- CreateIndex
CREATE UNIQUE INDEX "event_inquiries_eventId_askerId_key" ON "event_inquiries"("eventId", "askerId");

-- CreateIndex
CREATE INDEX "inquiry_messages_inquiryId_createdAt_idx" ON "inquiry_messages"("inquiryId", "createdAt");

-- AddForeignKey
ALTER TABLE "event_inquiries" ADD CONSTRAINT "event_inquiries_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_inquiries" ADD CONSTRAINT "event_inquiries_askerId_fkey" FOREIGN KEY ("askerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_inquiries" ADD CONSTRAINT "event_inquiries_organizerId_fkey" FOREIGN KEY ("organizerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inquiry_messages" ADD CONSTRAINT "inquiry_messages_inquiryId_fkey" FOREIGN KEY ("inquiryId") REFERENCES "event_inquiries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inquiry_messages" ADD CONSTRAINT "inquiry_messages_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
