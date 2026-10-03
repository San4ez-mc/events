-- DropIndex
DROP INDEX "events_description_trgm_idx";

-- DropIndex
DROP INDEX "events_title_trgm_idx";

-- AlterTable
ALTER TABLE "events" ADD COLUMN     "presetParticipants" INTEGER NOT NULL DEFAULT 0;
