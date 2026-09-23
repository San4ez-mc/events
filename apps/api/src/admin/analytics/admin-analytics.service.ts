import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";

/**
 * §46/§72 — a lightweight, on-demand platform summary. Not the per-event
 * `event_daily_stats` aggregate table §46 describes for the *organizer*
 * dashboard (Phase 7 already covers that on-demand, documented in
 * EventsService.getStats) — this is a much smaller admin-only surface (a
 * handful of COUNTs/SUMs), so a cache table would be premature at this
 * scale, same trade-off made throughout this project.
 */
@Injectable()
export class AdminAnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async getSummary() {
    const [
      totalUsers,
      totalOrganizers,
      eventsByStatus,
      totalRegistrations,
      revenue,
      openReports,
      pendingModeration,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { organizerActivatedAt: { not: null } } }),
      this.prisma.event.groupBy({ by: ["status"], _count: true }),
      this.prisma.registration.count(),
      this.prisma.platformPaymentOrder.aggregate({ where: { status: "PAID" }, _sum: { amount: true } }),
      this.prisma.report.count({ where: { status: "OPEN" } }),
      this.prisma.moderationCase.count({ where: { status: "PENDING" } }),
    ]);

    return {
      totalUsers,
      totalOrganizers,
      eventsByStatus: Object.fromEntries(eventsByStatus.map((row) => [row.status, row._count])),
      totalRegistrations,
      totalRevenue: revenue._sum.amount ?? 0,
      openReports,
      pendingModeration,
    };
  }
}
