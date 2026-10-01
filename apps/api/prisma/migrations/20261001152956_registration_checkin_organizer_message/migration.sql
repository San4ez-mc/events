-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'ORGANIZER_MESSAGE';

-- AlterTable
ALTER TABLE "event_registrations" ADD COLUMN     "checkedInAt" TIMESTAMP(3);
