-- CreateEnum
CREATE TYPE "CityAlertKind" AS ENUM ('DIGEST', 'NO_EVENTS');

-- CreateTable
CREATE TABLE "city_alerts" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "kind" "CityAlertKind" NOT NULL,
    "cityId" UUID,
    "query" TEXT,
    "token" TEXT NOT NULL,
    "lastSentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "city_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "city_alerts_token_key" ON "city_alerts"("token");

-- CreateIndex
CREATE INDEX "city_alerts_kind_lastSentAt_idx" ON "city_alerts"("kind", "lastSentAt");

-- CreateIndex
CREATE UNIQUE INDEX "city_alerts_email_kind_cityId_key" ON "city_alerts"("email", "kind", "cityId");

-- AddForeignKey
ALTER TABLE "city_alerts" ADD CONSTRAINT "city_alerts_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "cities"("id") ON DELETE CASCADE ON UPDATE CASCADE;
