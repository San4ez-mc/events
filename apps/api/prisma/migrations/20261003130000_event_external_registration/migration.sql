-- CreateEnum
CREATE TYPE "RegistrationMode" AS ENUM ('INTERNAL', 'EXTERNAL');

-- AlterTable
ALTER TABLE "events" ADD COLUMN     "externalRegistrationUrl" TEXT,
ADD COLUMN     "registrationMode" "RegistrationMode" NOT NULL DEFAULT 'INTERNAL';
