-- AlterTable
ALTER TABLE "events" ADD COLUMN "source" TEXT,
ADD COLUMN "sourceRef" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "events_source_sourceRef_key" ON "events"("source", "sourceRef");
