import { Injectable } from "@nestjs/common";
import { PAGINATION } from "@kiro/config";
import { SYSTEM_SETTING_DEFAULTS, SystemSettingKey, type CursorPage } from "@kiro/types";
import { PrismaService } from "../prisma/prisma.service";
import { ResourceNotFoundException } from "../common/exceptions/common-exceptions";
import { ApiException } from "../common/exceptions/api.exception";
import { AuditLogService } from "../audit/audit-log.service";
import { CreditsService } from "../credits/credits.service";
import type { CreateReferralSubmissionDto } from "./dto/create-referral-submission.dto";
import type { ListReferralSubmissionsDto } from "./dto/list-referral-submissions.dto";
import type { ResolveReferralSubmissionDto } from "./dto/resolve-referral-submission.dto";

const SUBMITTER_INCLUDE = {
  user: { select: { id: true, name: true, nickname: true, email: true } },
  event: { select: { id: true, title: true, slug: true } },
} as const;

/**
 * Marketing §referral — "share an event, tag @kiro.ukraine, earn credits". Verification is manual
 * (an admin checks the social post themselves, same posture as `Report`): this is just a
 * reviewable claim queue, and approving one grants credits via the existing manual-adjustment
 * ledger path rather than inventing a second automatic one.
 */
@Injectable()
export class ReferralsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
    private readonly credits: CreditsService,
  ) {}

  create(userId: string, dto: CreateReferralSubmissionDto) {
    return this.prisma.referralSubmission.create({
      data: { userId, eventId: dto.eventId, note: dto.note },
    });
  }

  listMine(userId: string) {
    return this.prisma.referralSubmission.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      include: { event: { select: { id: true, title: true, slug: true } } },
    });
  }

  async list(query: ListReferralSubmissionsDto): Promise<CursorPage<unknown>> {
    const limit = Math.min(query.limit ?? PAGINATION.defaultLimit, PAGINATION.maxLimit);
    const items = await this.prisma.referralSubmission.findMany({
      where: { status: query.status },
      orderBy: { createdAt: "desc" },
      take: limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      include: SUBMITTER_INCLUDE,
    });
    const hasMore = items.length > limit;
    const page = hasMore ? items.slice(0, limit) : items;
    return { items: page, nextCursor: hasMore ? page[page.length - 1]!.id : null, hasMore };
  }

  async resolve(adminId: string, id: string, dto: ResolveReferralSubmissionDto) {
    const submission = await this.prisma.referralSubmission.findUnique({ where: { id } });
    if (!submission) throw new ResourceNotFoundException("Referral submission not found");
    if (submission.status !== "PENDING") {
      throw new ApiException("VALIDATION_ERROR", "This submission was already reviewed", 400, {
        status: ["Already resolved"],
      });
    }

    const updated = await this.prisma.referralSubmission.update({
      where: { id },
      data: {
        status: dto.status,
        reviewedByAdminId: adminId,
        reviewedAt: new Date(),
        rejectionReason: dto.status === "REJECTED" ? dto.rejectionReason : undefined,
      },
    });

    if (dto.status === "APPROVED") {
      const amount = await this.getBonusAmount();
      await this.credits.adminAdjust(adminId, submission.userId, amount, `Referral bonus (submission ${id})`);
    }

    await this.auditLog.record({
      actorUserId: adminId,
      action: "REFERRAL_SUBMISSION_RESOLVE",
      entityType: "ReferralSubmission",
      entityId: id,
      before: { status: submission.status },
      after: { status: dto.status },
    });

    return updated;
  }

  private async getBonusAmount(): Promise<number> {
    const setting = await this.prisma.systemSetting.findUnique({
      where: { key: SystemSettingKey.REFERRAL_BONUS_CREDITS },
    });
    const value = setting?.valueJson;
    return typeof value === "number" ? value : (SYSTEM_SETTING_DEFAULTS[SystemSettingKey.REFERRAL_BONUS_CREDITS] as number);
  }
}
