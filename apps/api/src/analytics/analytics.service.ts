import { Injectable, Logger } from "@nestjs/common";
import type { AnalyticsAction, Prisma, TrafficSource } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

export interface TrackInput {
  eventId: string;
  action: AnalyticsAction;
  source?: TrafficSource;
  userId?: string;
  sessionId?: string;
}

/** Which daily-aggregate column each action increments (§46). UNSAVE / SUBSCRIBED are logged but not aggregated. */
const DAILY_COLUMN: Partial<
  Record<AnalyticsAction, keyof Prisma.EventDailyStatUncheckedUpdateInput>
> = {
  IMPRESSION: "impressions",
  VIEW: "views",
  SAVE: "saves",
  SHARE: "shares",
  REGISTRATION_STARTED: "registrationStarts",
  REGISTERED: "registrations",
  CANCELLED: "cancellations",
  PAYMENT_LINK_CLICK: "paymentClicks",
};

const startOfUtcDay = (d: Date) =>
  new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));

/**
 * §45-47 — append-only action log + daily aggregates. Recording is
 * best-effort and must never break the user-facing request that triggered it.
 */
@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Fire-and-forget helper for server-side call sites (save, register, cancel …). */
  record(input: TrackInput): void {
    void this.track([input]).catch((error: unknown) =>
      this.logger.warn(`analytics record failed: ${String(error)}`),
    );
  }

  /** Only events that exist are stored; unknown ids from clients are silently dropped. */
  async track(inputs: TrackInput[]): Promise<number> {
    if (inputs.length === 0) return 0;
    const known = await this.prisma.event.findMany({
      where: { id: { in: [...new Set(inputs.map((i) => i.eventId))] } },
      select: { id: true },
    });
    const knownIds = new Set(known.map((e) => e.id));
    const valid = inputs.filter((i) => knownIds.has(i.eventId));
    if (valid.length === 0) return 0;

    await this.prisma.eventAnalyticsEvent.createMany({
      data: valid.map((i) => ({
        eventId: i.eventId,
        action: i.action,
        source: i.source,
        userId: i.userId,
        sessionId: i.sessionId,
      })),
    });

    const date = startOfUtcDay(new Date());
    for (const i of valid) {
      const column = DAILY_COLUMN[i.action];
      if (!column) continue;
      await this.prisma.eventDailyStat.upsert({
        where: { eventId_date: { eventId: i.eventId, date } },
        create: { eventId: i.eventId, date, [column]: 1 },
        update: { [column]: { increment: 1 } },
      });
      if (i.action === "VIEW" && i.source)
        await this.bumpSource(i.eventId, date, i.source);
    }
    return valid.length;
  }

  /** viewsBySource is a small JSON counter per day; a read-modify-write inside a row lock keeps it consistent. */
  private async bumpSource(
    eventId: string,
    date: Date,
    source: TrafficSource,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<
        { viewsBySource: Record<string, number> }[]
      >`
        SELECT "viewsBySource" FROM event_daily_stats WHERE "eventId" = ${eventId}::uuid AND date = ${date} FOR UPDATE`;
      const current = rows[0]?.viewsBySource ?? {};
      current[source] = (current[source] ?? 0) + 1;
      await tx.eventDailyStat.update({
        where: { eventId_date: { eventId, date } },
        data: { viewsBySource: current },
      });
    });
  }

  /** §47 — dashboard numbers for one event, from the aggregate table (never COUNT over raw rows). */
  async summary(eventId: string, days = 30) {
    const since = startOfUtcDay(new Date(Date.now() - (days - 1) * 86_400_000));
    const rows = await this.prisma.eventDailyStat.findMany({
      where: { eventId, date: { gte: since } },
      orderBy: { date: "asc" },
    });

    const total = {
      impressions: 0,
      views: 0,
      saves: 0,
      shares: 0,
      registrationStarts: 0,
      registrations: 0,
      cancellations: 0,
      paymentClicks: 0,
    };
    const sources: Record<string, number> = {};
    for (const r of rows) {
      total.impressions += r.impressions;
      total.views += r.views;
      total.saves += r.saves;
      total.shares += r.shares;
      total.registrationStarts += r.registrationStarts;
      total.registrations += r.registrations;
      total.cancellations += r.cancellations;
      total.paymentClicks += r.paymentClicks;
      for (const [k, v] of Object.entries(
        r.viewsBySource as Record<string, number>,
      ))
        sources[k] = (sources[k] ?? 0) + v;
    }

    return {
      ...total,
      viewsBySource: sources,
      conversionViewToRegistration:
        total.views > 0
          ? Math.round((total.registrations / total.views) * 1000) / 10
          : null,
      daily: rows.map((r) => ({
        date: r.date.toISOString().slice(0, 10),
        impressions: r.impressions,
        views: r.views,
        registrations: r.registrations,
      })),
    };
  }
}
