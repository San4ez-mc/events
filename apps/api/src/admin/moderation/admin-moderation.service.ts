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

    // A moderator needs the whole text, who posted it and whether they can pay for publication - the 240-character
    // excerpt on `target` cuts long descriptions off, and a missing credit silently blocked the approve button.
    const eventIds = cases.filter((c) => c.targetType.toUpperCase() === "EVENT").map((c) => c.targetId);
    const events = eventIds.length
      ? await this.prisma.event.findMany({
          where: { id: { in: eventIds } },
          select: {
            id: true, description: true, startsAt: true, priceType: true, price: true, priceMax: true, currency: true, addressText: true, externalRegistrationUrl: true,
            owner: { select: { id: true, name: true, nickname: true, email: true } },
          },
        })
      : [];
    const balances = events.length
      ? await this.prisma.listingCreditLedger.groupBy({ by: ["userId"], where: { userId: { in: events.map((e) => e.owner.id) } }, _sum: { creditsDelta: true } })
      : [];
    const balanceOf = new Map(balances.map((b) => [b.userId, b._sum.creditsDelta ?? 0]));
    const eventById = new Map(events.map((e) => [e.id, e]));

    return cases.map((c) => {
      const e = eventById.get(c.targetId);
      return {
        ...c,
        target: targetFor(targets, c.targetType, c.targetId),
        event: e ? { ...e, ownerCredits: balanceOf.get(e.owner.id) ?? 0 } : null,
      };
    });
  }

  /** `waiveCredit`: publish without charging the organizer's listing credit (e.g. they have none yet). */
  async approve(caseId: string, adminId: string, waiveCredit = false) {
    const moderationCase = await this.prisma.moderationCase.findUnique({ where: { id: caseId } });
    if (!moderationCase) throw new ResourceNotFoundException("Moderation case not found");
    if (moderationCase.targetType !== "EVENT") {
      throw new ApiException("VALIDATION_ERROR", `Approving a ${moderationCase.targetType} case isn't supported yet`, 400);
    }
    return this.eventsService.approveModeration(moderationCase.targetId, adminId, { waiveCredit });
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
