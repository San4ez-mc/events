-- AlterTable
ALTER TABLE "user_preferences" ADD COLUMN     "showAge" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "friendsOnlyProfile" BOOLEAN NOT NULL DEFAULT false;
