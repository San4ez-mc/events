import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { ApiException } from "../../common/exceptions/api.exception";
import { ResourceNotFoundException } from "../../common/exceptions/common-exceptions";
import { EventsService } from "../../events/events.service";
import { resolveTargets, targetFor } from "../../common/utils/target-labels";

/** §53/§55 — the admin/moderator queue for the automatic pre-publish content scan's flagged events. */
@Injectable()
export class AdminModerationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventsService: EventsService,
  ) {}

  async listPending() {
    const cases = await this.prisma.moderationCase.findMany({
      where: { status: "PENDING" },
      orderBy: { createdAt: "asc" },
    });
    const targets = await resolveTargets(this.prisma, cases.map((c) => ({ type: c.targetType, id: c.targetId })));
    return cases.map((c) => ({ ...c, target: targetFor(targets, c.targetType, c.targetId) }));
  }

  async approve(caseId: string, adminId: string) {
    const moderationCase = await this.prisma.moderationCase.findUnique({ where: { id: caseId } });
    if (!moderationCase) throw new ResourceNotFoundException("Moderation case not found");
    if (moderationCase.targetType !== "EVENT") {
      throw new ApiException("VALIDATION_ERROR", `Approving a ${moderationCase.targetType} case isn't supported yet`, 400);
    }
    return this.eventsService.approveModeration(moderationCase.targetId, adminId);
  }

  async reject(caseId: string, adminId: string) {
    const moderationCase = await this.prisma.moderationCase.findUnique({ where: { id: caseId } });
    if (!moderationCase) throw new ResourceNotFoundException("Moderation case not found");
    if (moderationCase.targetType !== "EVENT") {
      throw new ApiException("VALIDATION_ERROR", `Rejecting a ${moderationCase.targetType} case isn't supported yet`, 400);
    }
    return this.eventsService.rejectModeration(moderationCase.targetId, adminId);
  }
}
