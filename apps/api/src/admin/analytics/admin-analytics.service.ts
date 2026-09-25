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
    const since = new Date();
    since.setUTCDate(since.getUTCDate() - 30);
    since.setUTCHours(0, 0, 0, 0);

    const [funnel, topViewed, 
      totalUsers,
      totalOrganizers,
      eventsByStatus,
      totalRegistrations,
      revenue,
      openReports,
      pendingModeration,
    ] = await Promise.all([
      this.prisma.eventDailyStat.aggregate({
        where: { date: { gte: since } },
        _sum: { impressions: true, views: true, shares: true, saves: true, registrations: true },
      }),
      this.prisma.eventDailyStat.groupBy({
        by: ["eventId"],
        where: { date: { gte: since } },
        _sum: { views: true, registrations: true },
        orderBy: { _sum: { views: "desc" } },
        take: 5,
      }),
      this.prisma.user.count(),
      this.prisma.user.count({ where: { organizerActivatedAt: { not: null } } }),
      this.prisma.event.groupBy({ by: ["status"], _count: true }),
      this.prisma.registration.count(),
      this.prisma.platformPaymentOrder.aggregate({ where: { status: "PAID" }, _sum: { amount: true } }),
      this.prisma.report.count({ where: { status: "OPEN" } }),
      this.prisma.moderationCase.count({ where: { status: "PENDING" } }),
    ]);

    const titles = await this.prisma.event.findMany({
      where: { id: { in: topViewed.map((row) => row.eventId) } },
      select: { id: true, title: true, slug: true },
    });
    const titleById = new Map(titles.map((e) => [e.id, e]));

    return {
      funnel30d: {
        impressions: funnel._sum.impressions ?? 0,
        views: funnel._sum.views ?? 0,
        shares: funnel._sum.shares ?? 0,
        saves: funnel._sum.saves ?? 0,
        registrations: funnel._sum.registrations ?? 0,
      },
      topEvents30d: topViewed.map((row) => ({
        id: row.eventId,
        title: titleById.get(row.eventId)?.title ?? "—",
        slug: titleById.get(row.eventId)?.slug ?? null,
        views: row._sum.views ?? 0,
        registrations: row._sum.registrations ?? 0,
      })),
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
