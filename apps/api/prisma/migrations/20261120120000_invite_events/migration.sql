-- CreateTable
CREATE TABLE "invite_events" (
    "id" UUID NOT NULL,
    "inviterId" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "device" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invite_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "invite_events_inviterId_createdAt_idx" ON "invite_events"("inviterId", "createdAt");

-- AddForeignKey
ALTER TABLE "invite_events" ADD CONSTRAINT "invite_events_inviterId_fkey" FOREIGN KEY ("inviterId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
