import { Injectable } from "@nestjs/common";
import type { Event, CollaboratorPermission } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { ForbiddenActionException, ResourceNotFoundException } from "../common/exceptions/common-exceptions";

/**
 * §30 — co-organizer authorization, shared by every module that gates an
 * action on "do you own or manage this event". The owner (`Event.ownerId`)
 * can always do everything; a MANAGER collaborator can do only what their
 * granted `permissions` include. Widening-only: every check here is an
 * *addition* on top of the plain ownerId check every service already had,
 * so existing owner-only behavior never narrows.
 */
@Injectable()
export class EventAccessService {
  constructor(private readonly prisma: PrismaService) {}

  /** Returns the event if the caller owns it or holds `permission` as a collaborator; throws otherwise. */
  async assertPermission(eventId: string, userId: string, permission: CollaboratorPermission): Promise<Event> {
    const event = await this.prisma.event.findUnique({ where: { id: eventId } });
    if (!event) throw new ResourceNotFoundException("Event not found");
    if (event.ownerId === userId) return event;

    const collaborator = await this.prisma.eventCollaborator.findUnique({
      where: { eventId_userId: { eventId, userId } },
    });
    if (collaborator?.permissions.includes(permission)) return event;

    throw new ForbiddenActionException();
  }

  /** Owner-only actions (e.g. managing collaborators themselves) — no permission can substitute for this. */
  async assertOwner(eventId: string, userId: string): Promise<Event> {
    const event = await this.prisma.event.findUnique({ where: { id: eventId } });
    if (!event) throw new ResourceNotFoundException("Event not found");
    if (event.ownerId !== userId) throw new ForbiddenActionException();
    return event;
  }
}
