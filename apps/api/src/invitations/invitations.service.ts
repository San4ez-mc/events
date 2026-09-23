import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { ApiException } from "../common/exceptions/api.exception";
import { ForbiddenActionException, ResourceNotFoundException } from "../common/exceptions/common-exceptions";
import { EventAccessService } from "../organizer/event-access.service";
import { NotificationsService } from "../notifications/notifications.service";
import type { SearchCandidatesDto } from "./dto/search-candidates.dto";

const PAST_PARTICIPANT_STATUSES = ["REGISTERED", "CONFIRMED", "ATTENDED"] as const;
const CANDIDATE_LIMIT = 20;

/** §71 — an organizer inviting someone who attended one of their past events to a new one. */
@Injectable()
export class InvitationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventAccess: EventAccessService,
    private readonly notifications: NotificationsService,
  ) {}

  /** Everyone who's genuinely participated in one of this organizer's events before, minus anyone already on this event. */
  async searchCandidates(eventId: string, organizerId: string, dto: SearchCandidatesDto) {
    await this.eventAccess.assertPermission(eventId, organizerId, "INVITE_PREVIOUS_PARTICIPANTS");

    const alreadyOnEvent = await this.prisma.registration.findMany({ where: { eventId }, select: { userId: true } });
    const alreadyInvited = await this.prisma.eventInvitation.findMany({
      where: { eventId, status: "PENDING" },
      select: { inviteeUserId: true },
    });
    const excludeIds = [
      organizerId,
      ...alreadyOnEvent.map((r) => r.userId),
      ...alreadyInvited.map((i) => i.inviteeUserId),
    ];

    const registrations = await this.prisma.registration.findMany({
      where: {
        status: { in: [...PAST_PARTICIPANT_STATUSES] },
        userId: { notIn: excludeIds },
        event: { ownerId: organizerId },
        ...(dto.q
          ? {
              user: {
                OR: [
                  { name: { contains: dto.q, mode: "insensitive" } },
                  { nickname: { contains: dto.q, mode: "insensitive" } },
                  { email: { contains: dto.q, mode: "insensitive" } },
                ],
              },
            }
          : {}),
      },
      select: { user: { select: { id: true, name: true, nickname: true, email: true, avatarUrl: true } } },
      distinct: ["userId"],
      take: CANDIDATE_LIMIT,
    });

    return registrations.map((r) => r.user);
  }

  async invite(eventId: string, organizerId: string, inviteeUserId: string) {
    await this.eventAccess.assertPermission(eventId, organizerId, "INVITE_PREVIOUS_PARTICIPANTS");

    const alreadyRegistered = await this.prisma.registration.findUnique({
      where: { eventId_userId: { eventId, userId: inviteeUserId } },
    });
    if (alreadyRegistered) {
      throw new ApiException("VALIDATION_ERROR", "This user is already registered for this event", 400);
    }

    const event = await this.prisma.event.findUniqueOrThrow({ where: { id: eventId }, select: { title: true } });
    const invitation = await this.prisma.eventInvitation.upsert({
      where: { eventId_inviteeUserId: { eventId, inviteeUserId } },
      create: { eventId, inviterUserId: organizerId, inviteeUserId },
      update: { status: "PENDING", createdAt: new Date() },
    });

    await this.notifications.create({
      userId: inviteeUserId,
      type: "ORGANIZER_NEW_EVENT",
      title: "You're invited!",
      body: `You've been invited to "${event.title}".`,
      payloadJson: { eventId, invitationId: invitation.id },
    });

    return invitation;
  }

  async listMine(userId: string) {
    return this.prisma.eventInvitation.findMany({
      where: { inviteeUserId: userId, status: "PENDING" },
      include: { event: { select: { id: true, slug: true, title: true, startsAt: true } } },
      orderBy: { createdAt: "desc" },
    });
  }

  /** Accepting only records interest — it doesn't auto-register them; they still go through the normal registration flow (custom fields, approval, capacity). */
  async respond(invitationId: string, userId: string, status: "ACCEPTED" | "DECLINED") {
    const invitation = await this.prisma.eventInvitation.findUnique({ where: { id: invitationId } });
    if (!invitation) throw new ResourceNotFoundException("Invitation not found");
    if (invitation.inviteeUserId !== userId) throw new ForbiddenActionException();
    if (invitation.status !== "PENDING") {
      throw new ApiException("VALIDATION_ERROR", "This invitation is no longer pending", 400);
    }
    return this.prisma.eventInvitation.update({ where: { id: invitationId }, data: { status } });
  }
}
