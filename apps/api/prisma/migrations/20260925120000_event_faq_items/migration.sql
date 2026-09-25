-- CreateTable
CREATE TABLE "event_faq_items" (
    "id" UUID NOT NULL,
    "eventId" UUID NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "event_faq_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "event_faq_items_eventId_sortOrder_idx" ON "event_faq_items"("eventId", "sortOrder");

-- AddForeignKey
ALTER TABLE "event_faq_items" ADD CONSTRAINT "event_faq_items_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

