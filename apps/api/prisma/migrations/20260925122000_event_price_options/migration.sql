-- AlterTable
ALTER TABLE "event_registrations" ADD COLUMN     "priceOptionId" UUID;

-- CreateTable
CREATE TABLE "event_price_options" (
    "id" UUID NOT NULL,
    "eventId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "price" DECIMAL(10,2) NOT NULL,
    "capacity" INTEGER,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_price_options_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "event_price_options_eventId_sortOrder_idx" ON "event_price_options"("eventId", "sortOrder");

-- AddForeignKey
ALTER TABLE "event_registrations" ADD CONSTRAINT "event_registrations_priceOptionId_fkey" FOREIGN KEY ("priceOptionId") REFERENCES "event_price_options"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_price_options" ADD CONSTRAINT "event_price_options_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

