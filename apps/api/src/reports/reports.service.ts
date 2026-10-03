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

  /** Who answers for the reported thing: the event's organizer, the reported user, or the review's author. */
  private async ownerOf(report: { targetType: string; targetId: string }): Promise<{ id: string; role: string; status: string } | null> {
    const select = { id: true, role: true, status: true } as const;
    const type = report.targetType.toUpperCase();
    if (type === "USER") return this.prisma.user.findUnique({ where: { id: report.targetId }, select });
    if (type === "EVENT") {
      const event = await this.prisma.event.findUnique({ where: { id: report.targetId }, select: { owner: { select } } });
      return event?.owner ?? null;
    }
    if (type === "REVIEW") {
      const review = await this.prisma.eventReview.findUnique({ where: { id: report.targetId }, select: { author: { select } } });
      return review?.author ?? null;
    }
    return null;
  }

  async resolve(adminId: string, reportId: string, dto: ResolveReportDto) {
    const report = await this.prisma.report.findUnique({ where: { id: reportId } });
    if (!report) throw new ResourceNotFoundException("Report not found");

    const type = report.targetType.toUpperCase();
    const owner = await this.ownerOf(report);
    const done: string[] = [];

    if (dto.hideTarget) {
      if (type === "REVIEW") {
        await this.prisma.eventReview.updateMany({ where: { id: report.targetId }, data: { status: "HIDDEN" } });
        done.push("review_hidden");
      } else if (type === "EVENT") {
        const hidden = await this.prisma.event.updateMany({
          where: { id: report.targetId, status: { in: ["PUBLISHED", "PENDING_MODERATION"] } },
          data: { status: "REJECTED" },
        });
        if (hidden.count > 0) done.push("event_hidden");
      }
    }

    // Never suspend staff from a report — role changes and staff discipline go through the Users screen.
    if (dto.suspendOwner && owner && owner.id !== adminId && owner.role === "USER" && owner.status === "ACTIVE") {
      await this.prisma.user.update({ where: { id: owner.id }, data: { status: "SUSPENDED" } });
      await this.auditLog.record({ actorUserId: adminId, action: "USER_STATUS_CHANGE", entityType: "User", entityId: owner.id, before: { status: owner.status }, after: { status: "SUSPENDED", viaReport: reportId } });
      await this.notifications
        .create({
          userId: owner.id,
          type: "MODERATION_UPDATE",
          title: "Account update",
          body: "Your account was suspended by a moderator. Contact support: kiro@fineko.space.",
        })
        .catch(() => undefined);
      done.push("owner_suspended");
    }

    const warn = dto.warnMessage?.trim();
    if (warn && owner && owner.id !== adminId) {
      await this.notifications
        .create({ userId: owner.id, type: "MODERATION_UPDATE", title: "Message from moderation", body: warn })
        .catch(() => undefined);
      done.push("owner_warned");
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
      after: { status: dto.status, actions: done, answered: Boolean(dto.note?.trim()) },
    });

    const note = dto.note?.trim();
    await this.notifications
      .create({
        userId: report.reporterId,
        type: "MODERATION_UPDATE",
        title: "Report reviewed",
        body: note ? note : dto.status === "RESOLVED" ? "Thanks — we reviewed your report and took action." : "We reviewed your report and found no violation.",
      })
      .catch(() => undefined);

    return updated;
  }
}
