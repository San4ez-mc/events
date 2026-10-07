import { Injectable, Logger, type OnApplicationBootstrap } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { ConfigService } from "@nestjs/config";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import type { EnvConfig } from "../../config/env.validation";

export interface InsightsReport {
  days: number;
  /** PostHog-backed sections are absent (and this is false) until the PostHog env vars are set. */
  posthogConfigured: boolean;
  posthogError?: boolean;
  eventFunnel?: { views: number; registrationStarted: number; registered: number };
  creationFunnel?: { step1: number; step2: number; step3: number; published: number };
  activation?: { signups: number; activated24h: number; avgMinutesToFirstAction: number | null };
  retention?: { cohort: number; d1: number; d7: number };
  swipes?: { right: number; left: number };
  /** Taps on "register / buy a ticket" for events whose registration happens on the organizer's own site. */
  externalRegistrations?: { clicks: number; people: number; top: { eventId: string; title: string; clicks: number }[] };
  searches?: { top: { query: string; count: number }[]; noResults: { query: string; count: number }[] };
  // From our own database — available even without PostHog.
  supplyDemand: { category: string; events: number; views: number; saves: number; registrations: number }[];
  supplyDemandByCity: { city: string; events: number; views: number; saves: number; registrations: number }[];
  payments: { provider: string; created: number; paid: number }[];
  referrals: { pending: number; approved: number; rejected: number };
  notifications: { channel: string; status: string; count: number }[];
}

const CACHE_MS = 5 * 60 * 1000;
/** Any of these after sign-up counts as "activated" (a first real action, not just opening the app). */
const FIRST_ACTIONS = `'event_save', 'registration_completed', 'event_published', 'create_step', 'search'`;

/**
 * Admin "insights" — funnels, activation, retention and search terms from PostHog (HogQL), plus supply/demand,
 * payment conversion, referral and notification-delivery numbers straight from our own tables. Cached for a few
 * minutes; PostHog failures degrade to the database-only sections instead of failing the whole report.
 */
@Injectable()
export class InsightsService implements OnApplicationBootstrap {
  private readonly logger = new Logger(InsightsService.name);
  private readonly cache = new Map<number, { at: number; report: InsightsReport }>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<EnvConfig, true>,
  ) {}

  /** Keeps the default 30-day report hot, so opening the admin page doesn't wait for the analytics queries (≈5 s cold). */
  @Cron("*/4 * * * *")
  async warmCache(): Promise<void> {
    await this.getReport(30, true).catch(() => undefined);
  }

  onApplicationBootstrap(): void {
    void this.warmCache();
  }

  async getReport(days: number, force = false): Promise<InsightsReport> {
    const hit = this.cache.get(days);
    if (!force && hit && Date.now() - hit.at < CACHE_MS) return hit.report;

    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const [supplyDemand, supplyDemandByCity, payments, referrals, notifications] = await Promise.all([
      this.supplyDemandBy("category", since),
      this.supplyDemandBy("city", since),
      this.paymentConversion(since),
      this.referralCounts(since),
      this.notificationDelivery(since),
    ]);

    const report: InsightsReport = {
      days,
      posthogConfigured: false,
      supplyDemand: supplyDemand.map((r) => ({ category: r.name, ...r.nums })),
      supplyDemandByCity: supplyDemandByCity.map((r) => ({ city: r.name, ...r.nums })),
      payments,
      referrals,
      notifications,
    };

    const projectId = this.config.get("POSTHOG_PROJECT_ID", { infer: true });
    const apiKey = this.config.get("POSTHOG_PERSONAL_API_KEY", { infer: true });
    if (projectId && apiKey) {
      report.posthogConfigured = true;
      try {
        Object.assign(report, await this.posthogSections(days, projectId, apiKey));
      } catch (err) {
        this.logger.warn(`PostHog insights failed: ${err instanceof Error ? err.message : String(err)}`);
        report.posthogError = true;
      }
    }

    this.cache.set(days, { at: Date.now(), report });
    return report;
  }

  private async posthogSections(days: number, projectId: string, apiKey: string): Promise<Partial<InsightsReport>> {
    const host = this.config.get("POSTHOG_HOST", { infer: true }).replace(/\/$/, "");
    const run = async (query: string): Promise<unknown[][]> => {
      const res = await fetch(`${host}/api/projects/${encodeURIComponent(projectId)}/query/`, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ query: { kind: "HogQLQuery", query } }),
      });
      if (!res.ok) throw new Error(`PostHog ${res.status}`);
      return ((await res.json()) as { results?: unknown[][] }).results ?? [];
    };
    const n = (v: unknown) => Number(v ?? 0);
    // `days` is a validated integer (see controller), so interpolating it into HogQL is safe.
    const since = `timestamp >= now() - INTERVAL ${days} DAY`;
    const distinct = (event: string, extra = "") => `SELECT count(DISTINCT person_id) FROM events WHERE event = '${event}' ${extra} AND ${since}`;

    const [views, started, registered, s1, s2, s3, published, activation, retention, swipes, top, noResults, extTotals, extTop] = await Promise.all([
      run(distinct("event_view")),
      run(distinct("event_registration_started")),
      run(distinct("registration_completed")),
      run(distinct("create_step", "AND toString(properties.step) = '1'")),
      run(distinct("create_step", "AND toString(properties.step) = '2'")),
      run(distinct("create_step", "AND toString(properties.step) = '3'")),
      run(distinct("event_published", "AND properties.outcome IN ('PUBLISHED', 'PENDING_MODERATION')")),
      // Per person: when they signed up and when they first did something real afterwards.
      run(`SELECT count(), countIf(fa > su AND dateDiff('hour', su, fa) <= 24), avgIf(dateDiff('minute', su, fa), fa > su AND dateDiff('hour', su, fa) <= 24) FROM (SELECT person_id, minIf(timestamp, event = 'sign_up') AS su, minIf(timestamp, event IN (${FIRST_ACTIONS})) AS fa FROM events WHERE ${since} GROUP BY person_id HAVING su > toDateTime('2000-01-01'))`),
      // Cohort = everyone first seen 7+ days ago (within 60 days); D1/D7 = came back exactly 1/7 days after their first day.
      run(`SELECT count(), countIf(has(days, arrayMin(days) + 1)), countIf(has(days, arrayMin(days) + 7)) FROM (SELECT person_id, groupUniqArray(toDate(timestamp)) AS days FROM events WHERE timestamp >= now() - INTERVAL 60 DAY GROUP BY person_id) WHERE arrayMin(days) <= today() - 7`),
      run(`SELECT countIf(properties.direction = 'right'), countIf(properties.direction = 'left') FROM events WHERE event = 'swipe' AND ${since}`),
      run(`SELECT properties.query AS q, count() FROM events WHERE event = 'search' AND properties.query != '' AND ${since} GROUP BY q ORDER BY count() DESC LIMIT 10`),
      run(`SELECT properties.query AS q, count() FROM events WHERE event = 'search' AND properties.query != '' AND toString(properties.results_count) = '0' AND ${since} GROUP BY q ORDER BY count() DESC LIMIT 10`),
      run(`SELECT count(), count(DISTINCT person_id) FROM events WHERE event = 'external_registration_click' AND ${since}`),
      run(`SELECT toString(properties.event_id) AS id, count() FROM events WHERE event = 'external_registration_click' AND ${since} GROUP BY id ORDER BY count() DESC LIMIT 10`),
    ]);
    const extIds = extTop.map((r) => String(r[0])).filter((id) => /^[0-9a-f-]{36}$/i.test(id));
    const extTitles = new Map((await this.prisma.event.findMany({ where: { id: { in: extIds } }, select: { id: true, title: true } })).map((e) => [e.id, e.title]));

    return {
      eventFunnel: { views: n(views[0]?.[0]), registrationStarted: n(started[0]?.[0]), registered: n(registered[0]?.[0]) },
      creationFunnel: { step1: n(s1[0]?.[0]), step2: n(s2[0]?.[0]), step3: n(s3[0]?.[0]), published: n(published[0]?.[0]) },
      activation: {
        signups: n(activation[0]?.[0]),
        activated24h: n(activation[0]?.[1]),
        avgMinutesToFirstAction: activation[0]?.[2] == null || Number.isNaN(Number(activation[0][2])) ? null : Math.round(n(activation[0][2])),
      },
      retention: { cohort: n(retention[0]?.[0]), d1: n(retention[0]?.[1]), d7: n(retention[0]?.[2]) },
      swipes: { right: n(swipes[0]?.[0]), left: n(swipes[0]?.[1]) },
      externalRegistrations: {
        clicks: n(extTotals[0]?.[0]),
        people: n(extTotals[0]?.[1]),
        top: extTop.map((r) => ({ eventId: String(r[0]), title: extTitles.get(String(r[0])) ?? String(r[0]), clicks: n(r[1]) })),
      },
      searches: {
        top: top.map((r) => ({ query: String(r[0]), count: n(r[1]) })),
        noResults: noResults.map((r) => ({ query: String(r[0]), count: n(r[1]) })),
      },
    };
  }

  /** Published events (supply) next to what people did with them in the window (demand), grouped by category or city. */
  private async supplyDemandBy(kind: "category" | "city", since: Date) {
    const rows =
      kind === "category"
        ? await this.prisma.$queryRaw<{ name: string | null; events: bigint; views: bigint; saves: bigint; registrations: bigint }[]>(Prisma.sql`
            SELECT c."nameUk" AS name, count(DISTINCT e.id) AS events, coalesce(sum(s.views), 0) AS views, coalesce(sum(s.saves), 0) AS saves, coalesce(sum(s.registrations), 0) AS registrations
            FROM events e LEFT JOIN categories c ON c.id = e."categoryId" LEFT JOIN event_daily_stats s ON s."eventId" = e.id AND s.date >= ${since}
            WHERE e.status = 'PUBLISHED' GROUP BY c."nameUk" ORDER BY views DESC LIMIT 12`)
        : await this.prisma.$queryRaw<{ name: string | null; events: bigint; views: bigint; saves: bigint; registrations: bigint }[]>(Prisma.sql`
            SELECT c."nameUk" AS name, count(DISTINCT e.id) AS events, coalesce(sum(s.views), 0) AS views, coalesce(sum(s.saves), 0) AS saves, coalesce(sum(s.registrations), 0) AS registrations
            FROM events e LEFT JOIN cities c ON c.id = e."cityId" LEFT JOIN event_daily_stats s ON s."eventId" = e.id AND s.date >= ${since}
            WHERE e.status = 'PUBLISHED' GROUP BY c."nameUk" ORDER BY views DESC LIMIT 12`);
    return rows.map((r) => ({
      name: r.name ?? "—",
      nums: { events: Number(r.events), views: Number(r.views), saves: Number(r.saves), registrations: Number(r.registrations) },
    }));
  }

  private async paymentConversion(since: Date) {
    const rows = await this.prisma.platformPaymentOrder.groupBy({
      by: ["provider", "status"],
      where: { createdAt: { gte: since } },
      _count: true,
    });
    const byProvider = new Map<string, { created: number; paid: number }>();
    for (const r of rows) {
      const entry = byProvider.get(r.provider) ?? { created: 0, paid: 0 };
      entry.created += r._count;
      if (r.status === "PAID") entry.paid += r._count;
      byProvider.set(r.provider, entry);
    }
    return [...byProvider.entries()].map(([provider, v]) => ({ provider, ...v }));
  }

  private async referralCounts(since: Date) {
    const rows = await this.prisma.referralSubmission.groupBy({ by: ["status"], where: { createdAt: { gte: since } }, _count: true });
    const get = (s: string) => rows.find((r) => r.status === s)?._count ?? 0;
    return { pending: get("PENDING"), approved: get("APPROVED"), rejected: get("REJECTED") };
  }

  /** Push vs in-app delivery results — a PUSH row that's all FAILED is how a missing FCM key shows up. */
  private async notificationDelivery(since: Date) {
    const rows = await this.prisma.notificationDelivery.groupBy({ by: ["channel", "status"], where: { createdAt: { gte: since } }, _count: true });
    return rows.map((r) => ({ channel: r.channel, status: r.status, count: r._count }));
  }
}
