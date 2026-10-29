import { Injectable } from "@nestjs/common";
import { ATTENDANCE_REGISTRATION_STATUSES } from "../../common/constants/registration-active-statuses";
import { PrismaService } from "../../prisma/prisma.service";
import type { DateRange } from "./date-range";

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
  };
  /** The organizers' free-text wishes, newest first. */
  organizerFeedback: { eventTitle: string; comment: string; submittedAt: string }[];
}

const LISTING_DOMAIN = "@listings.kiro.invalid";

/** Numbers straight from the database for the admin "growth" block; the period is a Kyiv-day window. */
@Injectable()
export class GrowthService {
  constructor(private readonly prisma: PrismaService) {}

  async getReport(range: DateRange): Promise<GrowthReport> {
    const { start, end } = range;
    const window = { gte: start, lt: end };
    const [newUsers, registrationRows, eventsWithRegistrations, reports, feedback] = await Promise.all([
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
        percent: registered > 0 ? Math.round((attended / registered) * 100) : null,
      },
      organizerFeedback: feedback.filter((f) => f.comment).map((f) => ({ eventTitle: f.event.title, comment: f.comment!, submittedAt: f.submittedAt.toISOString() })),
    };
  }
}
