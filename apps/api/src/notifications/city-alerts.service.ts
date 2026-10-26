import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { randomBytes } from "node:crypto";
import type { CityAlertKind } from "@prisma/client";
import type { EnvConfig } from "../config/env.validation";
import { PrismaService } from "../prisma/prisma.service";
import { MailService } from "../mail/mail.service";
import { ResourceNotFoundException } from "../common/exceptions/common-exceptions";
import { ApiException } from "../common/exceptions/api.exception";

const DAY = 24 * 60 * 60 * 1000;

/**
 * Email-only subscriptions for people without an account (or without the app): a weekly "куди піти" digest for a
 * city, and a one-off "something appeared" note for a city/query where a search came back empty.
 */
@Injectable()
export class CityAlertsService {
  private readonly logger = new Logger(CityAlertsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly config: ConfigService<EnvConfig, true>,
  ) {}

  /** Idempotent per (email, kind, city): asking twice is not an error and never sends twice. */
  async subscribe(input: { email: string; kind: CityAlertKind; cityId?: string; query?: string }): Promise<void> {
    const email = input.email.trim().toLowerCase();
    const cityId = input.cityId ?? null;
    if (cityId) {
      const city = await this.prisma.city.findUnique({ where: { id: cityId }, select: { id: true } });
      if (!city) throw new ResourceNotFoundException("City not found");
    } else if (input.kind === "NO_EVENTS") {
      throw new ApiException("VALIDATION_ERROR", "A city is required", 400);
    }
    const query = input.query?.trim().slice(0, 100) || null;
    const existing = await this.prisma.cityAlert.findFirst({ where: { email, kind: input.kind, cityId } });
    if (existing) {
      // Subscribing again after a one-off was sent re-arms it.
      if (input.kind === "NO_EVENTS" && existing.lastSentAt) {
        await this.prisma.cityAlert.update({ where: { id: existing.id }, data: { lastSentAt: null, query } });
      }
      return;
    }
    await this.prisma.cityAlert.create({
      data: { email, kind: input.kind, cityId, query, token: randomBytes(24).toString("hex") },
    });
  }

  /** Returns false when the token is unknown (already unsubscribed). */
  async unsubscribe(token: string): Promise<boolean> {
    const { count } = await this.prisma.cityAlert.deleteMany({ where: { token } });
    return count > 0;
  }

  private unsubscribeUrl(token: string): string {
    const base = this.config.get("APP_URL", { infer: true }).replace(/\/$/, "");
    return `${base}/api/v1/city-alerts/unsubscribe/${token}`;
  }

  private base(): string {
    return this.config.get("APP_URL", { infer: true }).replace(/\/$/, "");
  }

  /** Thursday: this weekend's events to every DIGEST subscriber, grouped by their city. At most one per 5 days. */
  async sendWeeklyDigests(weekendFrom: Date, weekendTo: Date): Promise<number> {
    const subs = await this.prisma.cityAlert.findMany({
      where: {
        kind: "DIGEST",
        OR: [{ lastSentAt: null }, { lastSentAt: { lt: new Date(Date.now() - 5 * DAY) } }],
      },
      include: { city: { select: { nameUk: true, slug: true } } },
      take: 500,
    });
    const cache = new Map<string, Array<{ title: string; slug: string }>>();
    let sent = 0;
    for (const sub of subs) {
      const key = sub.cityId ?? "all";
      if (!cache.has(key)) {
        const events = await this.prisma.event.findMany({
          where: {
            status: "PUBLISHED",
            isTest: false,
            visibility: "PUBLIC",
            startsAt: { gte: weekendFrom, lt: weekendTo },
            ...(sub.cityId ? { cityId: sub.cityId } : {}),
          },
          select: { id: true, title: true, slug: true },
          take: 30,
        });
        const views = events.length
          ? await this.prisma.eventDailyStat.groupBy({ by: ["eventId"], where: { eventId: { in: events.map((e) => e.id) } }, _sum: { views: true } })
          : [];
        const byId = new Map(views.map((v) => [v.eventId, v._sum.views ?? 0]));
        cache.set(
          key,
          [...events].sort((a, b) => (byId.get(b.id) ?? 0) - (byId.get(a.id) ?? 0)).slice(0, 6).map((e) => ({ title: e.title, slug: e.slug })),
        );
      }
      const picks = cache.get(key)!;
      if (picks.length === 0) continue;
      try {
        await this.mail.sendCityDigestEmail(sub.email, {
          cityName: sub.city?.nameUk ?? null,
          events: picks.map((e) => ({ title: e.title, url: `${this.base()}/events/${encodeURIComponent(e.slug)}?utm_source=digest&utm_medium=email` })),
          moreUrl: `${this.base()}/afisha/${sub.city?.slug ?? "kyiv"}/weekend?utm_source=digest&utm_medium=email`,
          createUrl: `${this.base()}/register?utm_source=digest&utm_medium=email`,
          unsubscribeUrl: this.unsubscribeUrl(sub.token),
        });
        await this.prisma.cityAlert.update({ where: { id: sub.id }, data: { lastSentAt: new Date() } });
        sent++;
      } catch (err) {
        this.logger.warn(`Digest email to alert ${sub.id} failed: ${(err as Error).message}`);
      }
    }
    return sent;
  }

  /** Once a city that had nothing gets upcoming events, tell everyone who searched there. Re-armed by subscribing again. */
  async sendEventsAppeared(): Promise<number> {
    const pending = await this.prisma.cityAlert.findMany({
      where: { kind: "NO_EVENTS", lastSentAt: null, cityId: { not: null } },
      include: { city: { select: { nameUk: true, slug: true } } },
      take: 500,
    });
    if (pending.length === 0) return 0;
    const now = new Date();
    const counts = await this.prisma.event.groupBy({
      by: ["cityId"],
      where: { cityId: { in: [...new Set(pending.map((p) => p.cityId!))] }, status: "PUBLISHED", isTest: false, visibility: "PUBLIC", startsAt: { gt: now } },
      _count: { _all: true },
    });
    const countByCity = new Map(counts.map((c) => [c.cityId, c._count._all]));
    let sent = 0;
    for (const sub of pending) {
      const n = countByCity.get(sub.cityId) ?? 0;
      if (n === 0 || !sub.city) continue;
      try {
        await this.mail.sendCityEventsAppearedEmail(sub.email, {
          cityName: sub.city.nameUk,
          count: n,
          url: `${this.base()}/afisha/${sub.city.slug}?utm_source=city_alert&utm_medium=email`,
          unsubscribeUrl: this.unsubscribeUrl(sub.token),
        });
        await this.prisma.cityAlert.update({ where: { id: sub.id }, data: { lastSentAt: new Date() } });
        sent++;
      } catch (err) {
        this.logger.warn(`City alert email ${sub.id} failed: ${(err as Error).message}`);
      }
    }
    return sent;
  }
}
