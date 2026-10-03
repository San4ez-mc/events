import { Injectable } from "@nestjs/common";
import { PAGINATION } from "@kiro/config";
import type { CursorPage } from "@kiro/types";
import { PrismaService } from "../prisma/prisma.service";
import { ResourceNotFoundException } from "../common/exceptions/common-exceptions";
import { AuditLogService } from "../audit/audit-log.service";
import { NotificationsService } from "../notifications/notifications.service";
import { resolveTargets, targetFor } from "../common/utils/target-labels";
import type { CreateReportDto } from "./dto/create-report.dto";
import type { ListReportsDto } from "./dto/list-reports.dto";
import type { ResolveReportDto } from "./dto/resolve-report.dto";

const REPORTER_INCLUDE = {
  reporter: { select: { id: true, name: true, nickname: true, email: true } },
} as const;

/** §39 — human-filed reports against an event/user/review, resolved by an admin (Phase 10's `/admin/reports`). */
@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
    private readonly notifications: NotificationsService,
  ) {}

  async create(reporterId: string, dto: CreateReportDto) {
    const report = await this.prisma.report.create({
      data: {
        reporterId,
        targetType: dto.targetType,
        targetId: dto.targetId,
        reason: dto.reason,
        description: dto.description,
      },
    });
    const targets = await resolveTargets(this.prisma, [{ type: dto.targetType, id: dto.targetId }]);
    const label = targetFor(targets, dto.targetType, dto.targetId)?.label ?? dto.targetType;
    await this.notifications
      .notifyStaff({ roles: ["MODERATOR", "ADMIN", "SUPER_ADMIN"], title: "New report", body: `Report on "${label}": ${dto.reason}`, adminTab: "reports", excludeUserId: reporterId })
      .catch(() => undefined);
    return report;
  }

  async list(query: ListReportsDto): Promise<CursorPage<unknown>> {
    const limit = Math.min(query.limit ?? PAGINATION.defaultLimit, PAGINATION.maxLimit);
    const reports = await this.prisma.report.findMany({
      where: { status: query.status },
      orderBy: { createdAt: "desc" },
      take: limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      include: REPORTER_INCLUDE,
    });
    const hasMore = reports.length > limit;
    const page = hasMore ? reports.slice(0, limit) : reports;
    // The raw row only has "EVENT + a uuid" — resolve it to a title/name so a moderator can tell what was reported.
    const targets = await resolveTargets(this.prisma, page.map((r) => ({ type: r.targetType, id: r.targetId })));
    const items = page.map((r) => ({ ...r, target: targetFor(targets, r.targetType, r.targetId) }));
    return { items, nextCursor: hasMore ? items[items.length - 1]!.id : null, hasMore };
  }

  async resolve(adminId: string, reportId: string, dto: ResolveReportDto) {
    const report = await this.prisma.report.findUnique({ where: { id: reportId } });
    if (!report) throw new ResourceNotFoundException("Report not found");

    if (dto.hideTarget && report.targetType === "REVIEW") {
      await this.prisma.eventReview.updateMany({
        where: { id: report.targetId },
        data: { status: "HIDDEN" },
      });
    }

    const updated = await this.prisma.report.update({
      where: { id: reportId },
      data: { status: dto.status, assignedAdminId: adminId, resolvedAt: new Date() },
    });

    await this.auditLog.record({
      actorUserId: adminId,
      action: "REPORT_RESOLVE",
      entityType: "Report",
      entityId: reportId,
      before: { status: report.status },
      after: { status: dto.status, hideTarget: dto.hideTarget ?? false },
    });

    await this.notifications
      .create({
        userId: report.reporterId,
        type: "MODERATION_UPDATE",
        title: "Report reviewed",
        body: dto.status === "RESOLVED" ? "Thanks — we reviewed your report and took action." : "We reviewed your report and found no violation.",
      })
      .catch(() => undefined);

    return updated;
  }
}
