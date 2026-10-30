import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { ATTENDANCE_REGISTRATION_STATUSES } from "../../common/constants/registration-active-statuses";
import { PrismaService } from "../../prisma/prisma.service";
import type { DateRange } from "./date-range";

export interface TurnoutRow {
  name: string;
  reports: number;
  registered: number;
  attended: number;
  percent: number | null;
}

export interface GrowthReport {
  from: string;
  to: string;
  days: number;
  /** Accounts created in the period (listing profiles excluded). */
  newUsers: number;
  /** People who registered on events in the period (cancelled and rejected ones are not counted). */
  newRegistrations: number;
  registrants: number;
  /** Events that started in the period, had registrations, and how many of those organizers sent the post-event report. */
  attendance: {
    eventsWithRegistrations: number;
    reports: number;
    registered: number;
    attended: number;
    /** attended / registered over the reported events, or null before any report. */
    percent: number | null;
    /** People who actually came to two or more events in the period, out of everyone who came at all. */
    repeatAttendees: number;
    attendees: number;
  };
  /** Turnout split by city / category / organizer (reported events only). */
  turnoutBy: { city: TurnoutRow[]; category: TurnoutRow[]; organizer: TurnoutRow[] };
  /**
   * Where the listings come from ("app" = created by organizers in Kiro, "telegram_bot", or an import source like "ottry"):
   * events published in the period, and what people did with every source's events in it.
   */
  sources: { source: string; events: number; views: number; saves: number; registrations: number; ticketClicks: number }[];
  /** The organizer funnel: created -> published, and what the abandoned drafts were missing. */
  organizerFunnel: {
    organizers: number;
    organizersPublished: number;
    created: number;
    published: number;
    abandoned: number;
    missing: { date: number; place: number; category: number; cover: number; description: number };
  };
  /** Opened ("read") share per notification type. */
  notificationsByType: { type: string; sent: number; read: number; readPercent: number }[];
  /** The organizers' free-text wishes, newest first. */
  organizerFeedback: { eventTitle: string; comment: string; submittedAt: string }[];
}

const LISTING_DOMAIN = "@listings.kiro.invalid";
const pct = (part: number, whole: number): number | null => (whole > 0 ? Math.round((part / whole) * 100) : null);

type TurnoutRaw = { name: string | null; reports: bigint; registered: bigint | null; attended: bigint | null };

/** Numbers straight from the database for the admin "growth" block; the period is a Kyiv-day window. */
@Injectable()
export class GrowthService {
  constructor(private readonly prisma: PrismaService) {}

  async getReport(range: DateRange): Promise<GrowthReport> {
    const { start, end } = range;
    const window = { gte: start, lt: end };
    const [newUsers, registrationRows, eventsWithRegistrations, reports, feedback, repeat, turnoutBy, sources, organizerFunnel, notificationsByType] = await Promise.all([
      this.prisma.user.count({ where: { createdAt: window, NOT: { email: { endsWith: LISTING_DOMAIN } } } }),
      this.prisma.registration.groupBy({
        by: ["userId"],
        where: { registeredAt: window, status: { notIn: ["CANCELLED", "REJECTED"] }, event: { isTest: false } },
        _count: true,
      }),
      this.prisma.event.count({
        where: {
          isTest: false,
          source: null,
          startsAt: { gte: start, lt: end, lte: new Date() },
          registrations: { some: { status: { in: [...ATTENDANCE_REGISTRATION_STATUSES] } } },
        },
      }),
      this.prisma.eventOrganizerReport.aggregate({
        where: { event: { startsAt: window, isTest: false } },
        _count: true,
        _sum: { registeredCount: true, attendedCount: true },
      }),
      this.prisma.eventOrganizerReport.findMany({
        where: { submittedAt: window, comment: { not: null } },
        orderBy: { submittedAt: "desc" },
        take: 20,
        select: { comment: true, submittedAt: true, event: { select: { title: true } } },
      }),
      this.repeatAttendees(range),
      this.turnoutBy(range),
      this.sourcesBreakdown(range),
      this.organizerFunnel(range),
      this.notificationsByType(range),
    ]);
    const registered = reports._sum.registeredCount ?? 0;
    const attended = reports._sum.attendedCount ?? 0;
    return {
      from: range.from,
      to: range.to,
      days: range.days,
      newUsers,
      newRegistrations: registrationRows.reduce((sum, r) => sum + r._count, 0),
      registrants: registrationRows.length,
      attendance: {
        eventsWithRegistrations,
        reports: reports._count,
        registered,
        attended,
        percent: pct(attended, registered),
        ...repeat,
      },
      turnoutBy,
      sources,
      organizerFunnel,
      notificationsByType,
      organizerFeedback: feedback.filter((f) => f.comment).map((f) => ({ eventTitle: f.event.title, comment: f.comment!, submittedAt: f.submittedAt.toISOString() })),
    };
  }

  private async repeatAttendees(range: DateRange) {
    const rows = await this.prisma.$queryRaw<{ attendees: bigint; repeaters: bigint }[]>(Prisma.sql`
      SELECT count(*) AS attendees, count(*) FILTER (WHERE visits >= 2) AS repeaters
      FROM (
        SELECT "userId", count(*) AS visits FROM event_registrations
        WHERE "checkedInAt" >= ${range.start} AND "checkedInAt" < ${range.end}
        GROUP BY "userId"
      ) t`);
    return { attendees: Number(rows[0]?.attendees ?? 0), repeatAttendees: Number(rows[0]?.repeaters ?? 0) };
  }

  /** The organizers' reports grouped by city, category and organizer, biggest groups first. */
  private async turnoutBy(range: DateRange) {
    const toRows = (rows: TurnoutRaw[]): TurnoutRow[] =>
      rows.map((r) => ({
        name: r.name ?? "—",
        reports: Number(r.reports),
        registered: Number(r.registered ?? 0),
        attended: Number(r.attended ?? 0),
        percent: pct(Number(r.attended ?? 0), Number(r.registered ?? 0)),
      }));
    const base = Prisma.sql`
      FROM event_organizer_reports r
      JOIN events e ON e.id = r."eventId"
      LEFT JOIN cities ci ON ci.id = e."cityId"
      LEFT JOIN categories c ON c.id = e."categoryId"
      LEFT JOIN users u ON u.id = e."ownerId"
      WHERE e."startsAt" >= ${range.start} AND e."startsAt" < ${range.end} AND e."isTest" = false`;
    const [city, category, organizer] = await Promise.all([
      this.prisma.$queryRaw<TurnoutRaw[]>(Prisma.sql`SELECT ci."nameUk" AS name, count(*) AS reports, sum(r."registeredCount") AS registered, sum(r."attendedCount") AS attended ${base} GROUP BY ci."nameUk" HAVING sum(r."registeredCount") > 0 ORDER BY registered DESC LIMIT 8`),
      this.prisma.$queryRaw<TurnoutRaw[]>(Prisma.sql`SELECT c."nameUk" AS name, count(*) AS reports, sum(r."registeredCount") AS registered, sum(r."attendedCount") AS attended ${base} GROUP BY c."nameUk" HAVING sum(r."registeredCount") > 0 ORDER BY registered DESC LIMIT 8`),
      this.prisma.$queryRaw<TurnoutRaw[]>(Prisma.sql`SELECT coalesce(u.name, u.nickname) AS name, count(*) AS reports, sum(r."registeredCount") AS registered, sum(r."attendedCount") AS attended ${base} GROUP BY u.id, u.name, u.nickname HAVING sum(r."registeredCount") > 0 ORDER BY registered DESC LIMIT 8`),
    ]);
    return { city: toRows(city), category: toRows(category), organizer: toRows(organizer) };
  }

  /** Imported listings next to our own: what each source brings in views, saves, registrations and clicks on "Tickets". */
  private async sourcesBreakdown(range: DateRange) {
    const [published, stats] = await Promise.all([
      this.prisma.$queryRaw<{ source: string; events: bigint }[]>(Prisma.sql`
        SELECT coalesce(source, 'app') AS source, count(*) AS events FROM events
        WHERE "isTest" = false AND "publishedAt" >= ${range.start} AND "publishedAt" < ${range.end}
        GROUP BY 1`),
      this.prisma.$queryRaw<{ source: string; views: bigint; saves: bigint; registrations: bigint; clicks: bigint }[]>(Prisma.sql`
        SELECT coalesce(e.source, 'app') AS source, coalesce(sum(s.views), 0) AS views, coalesce(sum(s.saves), 0) AS saves,
               coalesce(sum(s.registrations), 0) AS registrations, coalesce(sum(s."paymentClicks"), 0) AS clicks
        FROM event_daily_stats s JOIN events e ON e.id = s."eventId"
        WHERE e."isTest" = false AND s.date >= ${range.from}::date AND s.date < ${range.toExclusive}::date
        GROUP BY 1`),
    ]);
    const bySource = new Map<string, { source: string; events: number; views: number; saves: number; registrations: number; ticketClicks: number }>();
    const row = (source: string) => {
      let r = bySource.get(source);
      if (!r) bySource.set(source, (r = { source, events: 0, views: 0, saves: 0, registrations: 0, ticketClicks: 0 }));
      return r;
    };
    for (const p of published) row(p.source).events = Number(p.events);
    for (const s of stats) Object.assign(row(s.source), { views: Number(s.views), saves: Number(s.saves), registrations: Number(s.registrations), ticketClicks: Number(s.clicks) });
    return [...bySource.values()].sort((a, b) => b.views - a.views);
  }

  /** Drafts created by organizers themselves: how many got published, and what the abandoned ones lack (the step people quit on). */
  private async organizerFunnel(range: DateRange) {
    const created = { createdAt: { gte: range.start, lt: range.end }, isTest: false, source: null, NOT: { owner: { email: { endsWith: LISTING_DOMAIN } } } } satisfies Prisma.EventWhereInput;
    const abandoned = { ...created, status: "DRAFT" as const, createdAt: { gte: range.start, lt: new Date(Math.min(range.end.getTime(), Date.now() - 24 * 3_600_000)) } };
    const [total, published, owners, publishedOwners, abandonedCount, noDate, noPlace, noCategory, noCover, noDescription] = await Promise.all([
      this.prisma.event.count({ where: created }),
      this.prisma.event.count({ where: { ...created, publishedAt: { not: null } } }),
      this.prisma.event.groupBy({ by: ["ownerId"], where: created }),
      this.prisma.event.groupBy({ by: ["ownerId"], where: { ...created, publishedAt: { not: null } } }),
      this.prisma.event.count({ where: abandoned }),
      this.prisma.event.count({ where: { ...abandoned, startsAt: null } }),
      this.prisma.event.count({ where: { ...abandoned, cityId: null } }),
      this.prisma.event.count({ where: { ...abandoned, categoryId: null } }),
      this.prisma.event.count({ where: { ...abandoned, media: { none: {} } } }),
      this.prisma.event.count({ where: { ...abandoned, OR: [{ description: null }, { description: "" }] } }),
    ]);
    return {
      organizers: owners.length,
      organizersPublished: publishedOwners.length,
      created: total,
      published,
      abandoned: abandonedCount,
      missing: { date: noDate, place: noPlace, category: noCategory, cover: noCover, description: noDescription },
    };
  }

  /** Which notification types people actually open. */
  private async notificationsByType(range: DateRange) {
    const rows = await this.prisma.$queryRaw<{ type: string; sent: bigint; read: bigint }[]>(Prisma.sql`
      SELECT n.type::text AS type, count(*) AS sent, count(n."readAt") AS read
      FROM notifications n JOIN users u ON u.id = n."userId"
      WHERE n."createdAt" >= ${range.start} AND n."createdAt" < ${range.end} AND u.email NOT LIKE ${"%" + LISTING_DOMAIN}
      GROUP BY n.type ORDER BY sent DESC LIMIT 15`);
    return rows.map((r) => ({ type: r.type, sent: Number(r.sent), read: Number(r.read), readPercent: pct(Number(r.read), Number(r.sent)) ?? 0 }));
  }
}
