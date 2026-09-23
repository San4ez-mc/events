-- CreateEnum
CREATE TYPE "CollaboratorRole" AS ENUM ('OWNER', 'MANAGER');

-- CreateEnum
CREATE TYPE "CollaboratorPermission" AS ENUM ('EDIT_EVENT', 'MANAGE_REGISTRATIONS', 'MANAGE_PAYMENTS', 'SEND_NOTIFICATIONS', 'MANAGE_CHAT', 'INVITE_PREVIOUS_PARTICIPANTS', 'VIEW_ANALYTICS');

-- CreateEnum
CREATE TYPE "EventInvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'EXPIRED');

-- CreateTable
CREATE TABLE "event_collaborators" (
    "id" UUID NOT NULL,
    "eventId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "role" "CollaboratorRole" NOT NULL DEFAULT 'MANAGER',
    "permissions" "CollaboratorPermission"[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_collaborators_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_invitations" (
    "id" UUID NOT NULL,
    "eventId" UUID NOT NULL,
    "inviterUserId" UUID NOT NULL,
    "inviteeUserId" UUID NOT NULL,
    "status" "EventInvitationStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_invitations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "event_collaborators_eventId_userId_key" ON "event_collaborators"("eventId", "userId");

-- CreateIndex
CREATE INDEX "event_invitations_inviteeUserId_status_idx" ON "event_invitations"("inviteeUserId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "event_invitations_eventId_inviteeUserId_key" ON "event_invitations"("eventId", "inviteeUserId");

-- AddForeignKey
ALTER TABLE "event_collaborators" ADD CONSTRAINT "event_collaborators_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_collaborators" ADD CONSTRAINT "event_collaborators_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_invitations" ADD CONSTRAINT "event_invitations_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_invitations" ADD CONSTRAINT "event_invitations_inviterUserId_fkey" FOREIGN KEY ("inviterUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_invitations" ADD CONSTRAINT "event_invitations_inviteeUserId_fkey" FOREIGN KEY ("inviteeUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
