import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { ApiException } from "../common/exceptions/api.exception";
import { ResourceNotFoundException } from "../common/exceptions/common-exceptions";
import { EventAccessService } from "../organizer/event-access.service";
import type { AddCollaboratorDto } from "./dto/add-collaborator.dto";
import type { UpdateCollaboratorDto } from "./dto/update-collaborator.dto";

const COLLABORATOR_INCLUDE = {
  user: { select: { id: true, name: true, nickname: true, avatarUrl: true, email: true } },
} satisfies Prisma.EventCollaboratorInclude;

/** §30 — co-organizers. Managing collaborators is an owner-only action (no permission can substitute for it). */
@Injectable()
export class CollaboratorsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventAccess: EventAccessService,
  ) {}

  async list(eventId: string, userId: string) {
    await this.eventAccess.assertOwner(eventId, userId);
    return this.prisma.eventCollaborator.findMany({
      where: { eventId },
      include: COLLABORATOR_INCLUDE,
      orderBy: { createdAt: "asc" },
    });
  }

  async add(eventId: string, ownerId: string, dto: AddCollaboratorDto) {
    const event = await this.eventAccess.assertOwner(eventId, ownerId);
    if (dto.userId === event.ownerId) {
      throw new ApiException("VALIDATION_ERROR", "The owner doesn't need to be added as a collaborator", 400);
    }
    const target = await this.prisma.user.findUnique({ where: { id: dto.userId }, select: { id: true } });
    if (!target) throw new ResourceNotFoundException("User not found");

    return this.prisma.eventCollaborator.upsert({
      where: { eventId_userId: { eventId, userId: dto.userId } },
      create: { eventId, userId: dto.userId, permissions: dto.permissions },
      update: { permissions: dto.permissions },
      include: COLLABORATOR_INCLUDE,
    });
  }

  async update(eventId: string, ownerId: string, collaboratorId: string, dto: UpdateCollaboratorDto) {
    await this.eventAccess.assertOwner(eventId, ownerId);
    const collaborator = await this.prisma.eventCollaborator.findUnique({ where: { id: collaboratorId } });
    if (!collaborator || collaborator.eventId !== eventId) throw new ResourceNotFoundException("Collaborator not found");
    return this.prisma.eventCollaborator.update({
      where: { id: collaboratorId },
      data: { permissions: dto.permissions },
      include: COLLABORATOR_INCLUDE,
    });
  }

  async remove(eventId: string, ownerId: string, collaboratorId: string): Promise<void> {
    await this.eventAccess.assertOwner(eventId, ownerId);
    const collaborator = await this.prisma.eventCollaborator.findUnique({ where: { id: collaboratorId } });
    if (!collaborator || collaborator.eventId !== eventId) throw new ResourceNotFoundException("Collaborator not found");
    await this.prisma.eventCollaborator.delete({ where: { id: collaboratorId } });
  }
}
