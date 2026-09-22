-- CreateEnum
CREATE TYPE "RegistrationFieldType" AS ENUM ('TEXT', 'TEXTAREA', 'NUMBER', 'PHONE', 'EMAIL', 'SELECT', 'MULTISELECT', 'CHECKBOX', 'DATE');

-- CreateEnum
CREATE TYPE "RegistrationStatus" AS ENUM ('PENDING', 'REGISTERED', 'PAYMENT_PENDING', 'CONFIRMED', 'REJECTED', 'CANCELLED', 'ATTENDED', 'NO_SHOW', 'WAITLISTED');

-- CreateTable
CREATE TABLE "event_registration_fields" (
    "id" UUID NOT NULL,
    "eventId" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "type" "RegistrationFieldType" NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "optionsJson" JSONB,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_registration_fields_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_registrations" (
    "id" UUID NOT NULL,
    "eventId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "status" "RegistrationStatus" NOT NULL DEFAULT 'PENDING',
    "showAsParticipant" BOOLEAN NOT NULL DEFAULT false,
    "registeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "paymentClickedAt" TIMESTAMP(3),
    "paymentConfirmedAt" TIMESTAMP(3),
    "organizerPrivateNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "event_registrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_registration_answers" (
    "id" UUID NOT NULL,
    "registrationId" UUID NOT NULL,
    "fieldId" UUID NOT NULL,
    "valueJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_registration_answers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "event_registration_fields_eventId_idx" ON "event_registration_fields"("eventId");

-- CreateIndex
CREATE INDEX "event_registrations_eventId_status_idx" ON "event_registrations"("eventId", "status");

-- CreateIndex
CREATE INDEX "event_registrations_userId_idx" ON "event_registrations"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "event_registrations_eventId_userId_key" ON "event_registrations"("eventId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "event_registration_answers_registrationId_fieldId_key" ON "event_registration_answers"("registrationId", "fieldId");

-- AddForeignKey
ALTER TABLE "event_registration_fields" ADD CONSTRAINT "event_registration_fields_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_registrations" ADD CONSTRAINT "event_registrations_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_registrations" ADD CONSTRAINT "event_registrations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_registration_answers" ADD CONSTRAINT "event_registration_answers_registrationId_fkey" FOREIGN KEY ("registrationId") REFERENCES "event_registrations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_registration_answers" ADD CONSTRAINT "event_registration_answers_fieldId_fkey" FOREIGN KEY ("fieldId") REFERENCES "event_registration_fields"("id") ON DELETE CASCADE ON UPDATE CASCADE;
