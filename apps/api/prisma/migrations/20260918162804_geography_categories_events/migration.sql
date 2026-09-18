-- CreateEnum
CREATE TYPE "RegionStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "CityStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "DistrictStatus" AS ENUM ('ACTIVE', 'PENDING', 'MERGED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "GeoSource" AS ENUM ('SYSTEM', 'USER_CREATED', 'ADMIN_CREATED');

-- CreateEnum
CREATE TYPE "CategoryStatus" AS ENUM ('ACTIVE', 'PENDING', 'MERGED', 'HIDDEN', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "RecurrenceType" AS ENUM ('DAILY', 'EVERY_N_DAYS', 'WEEKLY', 'EVERY_N_WEEKS', 'SPECIFIC_WEEKDAY', 'SPECIFIC_DAY_OF_MONTH', 'EVERY_N_MONTHS');

-- CreateEnum
CREATE TYPE "EventStatus" AS ENUM ('DRAFT', 'PENDING_MODERATION', 'PUBLISHED', 'REJECTED', 'CANCELLED', 'COMPLETED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "EventVisibility" AS ENUM ('PUBLIC', 'PRIVATE');

-- CreateEnum
CREATE TYPE "EventFormat" AS ENUM ('OFFLINE', 'ONLINE');

-- CreateEnum
CREATE TYPE "ApprovalMode" AS ENUM ('AUTO', 'ORGANIZER_APPROVAL');

-- CreateEnum
CREATE TYPE "EventPriceType" AS ENUM ('FREE', 'PAID');

-- CreateEnum
CREATE TYPE "Currency" AS ENUM ('UAH');

-- CreateEnum
CREATE TYPE "EventMediaType" AS ENUM ('IMAGE', 'VIDEO');

-- CreateEnum
CREATE TYPE "MediaModerationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "regions" (
    "id" UUID NOT NULL,
    "countryCode" TEXT NOT NULL,
    "nameUk" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "externalCode" TEXT,
    "status" "RegionStatus" NOT NULL DEFAULT 'ACTIVE',

    CONSTRAINT "regions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cities" (
    "id" UUID NOT NULL,
    "regionId" UUID NOT NULL,
    "nameUk" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "latitude" DECIMAL(9,6) NOT NULL,
    "longitude" DECIMAL(9,6) NOT NULL,
    "population" INTEGER,
    "status" "CityStatus" NOT NULL DEFAULT 'ACTIVE',

    CONSTRAINT "cities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "districts" (
    "id" UUID NOT NULL,
    "cityId" UUID NOT NULL,
    "nameUk" TEXT NOT NULL,
    "nameEn" TEXT,
    "status" "DistrictStatus" NOT NULL DEFAULT 'ACTIVE',
    "source" "GeoSource" NOT NULL DEFAULT 'SYSTEM',
    "createdByUserId" UUID,
    "mergedIntoDistrictId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "districts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" UUID NOT NULL,
    "parentId" UUID,
    "slug" TEXT NOT NULL,
    "nameUk" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "icon" TEXT,
    "status" "CategoryStatus" NOT NULL DEFAULT 'ACTIVE',
    "source" "GeoSource" NOT NULL DEFAULT 'SYSTEM',
    "createdByUserId" UUID,
    "mergedIntoCategoryId" UUID,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_series" (
    "id" UUID NOT NULL,
    "ownerId" UUID NOT NULL,
    "recurrenceType" "RecurrenceType" NOT NULL,
    "recurrenceRuleJson" JSONB NOT NULL,
    "templateEventId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "event_series_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "events" (
    "id" UUID NOT NULL,
    "ownerId" UUID NOT NULL,
    "seriesId" UUID,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "categoryId" UUID NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'uk',
    "status" "EventStatus" NOT NULL DEFAULT 'DRAFT',
    "visibility" "EventVisibility" NOT NULL DEFAULT 'PUBLIC',
    "format" "EventFormat" NOT NULL DEFAULT 'OFFLINE',
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'Europe/Kyiv',
    "cityId" UUID,
    "districtId" UUID,
    "addressText" TEXT,
    "addressDetails" JSONB,
    "googlePlaceId" TEXT,
    "latitude" DECIMAL(9,6),
    "longitude" DECIMAL(9,6),
    "onlineUrl" TEXT,
    "capacity" INTEGER,
    "minParticipants" INTEGER,
    "registrationDeadline" TIMESTAMP(3),
    "approvalMode" "ApprovalMode" NOT NULL DEFAULT 'AUTO',
    "ageRestriction" INTEGER,
    "rules" TEXT,
    "priceType" "EventPriceType" NOT NULL DEFAULT 'FREE',
    "price" DECIMAL(10,2),
    "currency" "Currency" NOT NULL DEFAULT 'UAH',
    "paymentUrl" TEXT,
    "publishedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_media" (
    "id" UUID NOT NULL,
    "eventId" UUID NOT NULL,
    "type" "EventMediaType" NOT NULL,
    "originalUrl" TEXT NOT NULL,
    "displayUrl" TEXT NOT NULL,
    "thumbnailUrl" TEXT NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "durationSeconds" INTEGER,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "focalX" DECIMAL(4,3),
    "focalY" DECIMAL(4,3),
    "moderationStatus" "MediaModerationStatus" NOT NULL DEFAULT 'APPROVED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_media_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "cities_slug_key" ON "cities"("slug");

-- CreateIndex
CREATE INDEX "cities_regionId_idx" ON "cities"("regionId");

-- CreateIndex
CREATE INDEX "districts_cityId_idx" ON "districts"("cityId");

-- CreateIndex
CREATE INDEX "districts_mergedIntoDistrictId_idx" ON "districts"("mergedIntoDistrictId");

-- CreateIndex
CREATE UNIQUE INDEX "categories_slug_key" ON "categories"("slug");

-- CreateIndex
CREATE INDEX "categories_parentId_idx" ON "categories"("parentId");

-- CreateIndex
CREATE INDEX "categories_mergedIntoCategoryId_idx" ON "categories"("mergedIntoCategoryId");

-- CreateIndex
CREATE INDEX "event_series_ownerId_idx" ON "event_series"("ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "events_slug_key" ON "events"("slug");

-- CreateIndex
CREATE INDEX "events_ownerId_idx" ON "events"("ownerId");

-- CreateIndex
CREATE INDEX "events_categoryId_idx" ON "events"("categoryId");

-- CreateIndex
CREATE INDEX "events_cityId_idx" ON "events"("cityId");

-- CreateIndex
CREATE INDEX "events_districtId_idx" ON "events"("districtId");

-- CreateIndex
CREATE INDEX "events_seriesId_idx" ON "events"("seriesId");

-- CreateIndex
CREATE INDEX "events_status_visibility_idx" ON "events"("status", "visibility");

-- CreateIndex
CREATE INDEX "event_media_eventId_idx" ON "event_media"("eventId");

-- AddForeignKey
ALTER TABLE "cities" ADD CONSTRAINT "cities_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "regions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "districts" ADD CONSTRAINT "districts_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "cities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "districts" ADD CONSTRAINT "districts_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "districts" ADD CONSTRAINT "districts_mergedIntoDistrictId_fkey" FOREIGN KEY ("mergedIntoDistrictId") REFERENCES "districts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_mergedIntoCategoryId_fkey" FOREIGN KEY ("mergedIntoCategoryId") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_series" ADD CONSTRAINT "event_series_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "event_series"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "cities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_districtId_fkey" FOREIGN KEY ("districtId") REFERENCES "districts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_media" ADD CONSTRAINT "event_media_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
