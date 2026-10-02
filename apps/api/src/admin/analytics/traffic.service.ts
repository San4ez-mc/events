import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { EnvConfig } from "../../config/env.validation";

export interface TrafficReport {
  configured: boolean;
  days: number;
  totals?: { visitors: number; views: number; sessions: number; avgSessionSeconds: number };
  daily?: { date: string; visitors: number; views: number }[];
  topPages?: { page: string; views: number; visitors: number; avgSeconds: number | null }[];
  platforms?: { platform: string; visitors: number; avgSessionSeconds: number | null }[];
  referrers?: { source: string; visitors: number }[];
  /** Website visitors by operating system (iOS / Android / Windows / macOS...) — a stand-in for "how many iPhone users do we have" before there is an iOS app. */
  webOs?: { os: string; visitors: number }[];
  error?: string;
}

const CACHE_MS = 5 * 60 * 1000;

/**
 * Admin "traffic" dashboard — reads the visitor/page-view events the website and the mobile app send to PostHog
 * (HogQL via PostHog's Query API, authenticated with a personal API key kept only on the server). Results are cached
 * for a few minutes so opening the admin tab repeatedly doesn't hammer PostHog's rate limit.
 */
@Injectable()
export class TrafficService {
  private readonly logger = new Logger(TrafficService.name);
  private readonly cache = new Map<number, { at: number; report: TrafficReport }>();

  constructor(private readonly config: ConfigService<EnvConfig, true>) {}

  async getReport(days: number): Promise<TrafficReport> {
    const projectId = this.config.get("POSTHOG_PROJECT_ID", { infer: true });
    const apiKey = this.config.get("POSTHOG_PERSONAL_API_KEY", { infer: true });
    if (!projectId || !apiKey) return { configured: false, days };

    const hit = this.cache.get(days);
    if (hit && Date.now() - hit.at < CACHE_MS) return hit.report;

    try {
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

      // `days` is a validated integer (see controller), so interpolating it into HogQL is safe.
      const since = `timestamp >= now() - INTERVAL ${days} DAY`;
      const pageEvents = `event IN ('$pageview', '$screen')`;
      // A session with one event has no measurable length, so only sessions with 2+ events count towards averages.
      const sessionLengths = `SELECT any(properties.platform) AS platform, dateDiff('second', min(timestamp), max(timestamp)) AS d FROM events WHERE ${since} AND properties.$session_id IS NOT NULL AND properties.$session_id != '' GROUP BY properties.$session_id HAVING count() > 1`;
      const [totals, daily, pages, platforms, referrers, avgSession, avgSessionByPlatform, pageTimes, webOs] = await Promise.all([
        run(`SELECT count(DISTINCT person_id), countIf(${pageEvents}), count(DISTINCT properties.$session_id) FROM events WHERE ${since}`),
        run(`SELECT toString(toDate(timestamp)) AS d, count(DISTINCT person_id), countIf(${pageEvents}) FROM events WHERE ${since} GROUP BY d ORDER BY d`),
        run(`SELECT coalesce(properties.$pathname, properties.$screen_name, '?') AS page, count(), count(DISTINCT person_id) FROM events WHERE ${pageEvents} AND ${since} GROUP BY page ORDER BY count() DESC LIMIT 15`),
        run(`SELECT coalesce(properties.platform, 'unknown') AS platform, count(DISTINCT person_id) FROM events WHERE ${since} GROUP BY platform ORDER BY 2 DESC`),
        run(`SELECT coalesce(nullIf(properties.$referring_domain, ''), '$direct') AS src, count(DISTINCT person_id) FROM events WHERE event = '$pageview' AND ${since} GROUP BY src ORDER BY 2 DESC LIMIT 10`),
        run(`SELECT avg(d) FROM (${sessionLengths})`),
        run(`SELECT coalesce(platform, 'unknown'), avg(d) FROM (${sessionLengths}) GROUP BY 1`),
        // Web sends $pageleave (with $prev_pageview_duration), the app sends screen_leave (with duration_seconds).
        run(`SELECT page, avg(dur) FROM (SELECT coalesce(properties.$prev_pageview_pathname, properties.$pathname, properties.$screen_name) AS page, coalesce(toFloat(properties.$prev_pageview_duration), toFloat(properties.duration_seconds)) AS dur FROM events WHERE event IN ('$pageleave', 'screen_leave') AND ${since}) WHERE dur > 0 AND dur < 1800 GROUP BY page`),
        run(`SELECT coalesce(nullIf(properties.$os, ''), 'unknown') AS os, count(DISTINCT person_id) FROM events WHERE properties.platform = 'web' AND ${since} GROUP BY os ORDER BY 2 DESC`),
      ]);
      const timeByPage = new Map(pageTimes.map((r) => [String(r[0]), Number(r[1])]));
      const sessionByPlatform = new Map(avgSessionByPlatform.map((r) => [String(r[0]), Number(r[1])]));

      const report: TrafficReport = {
        configured: true,
        days,
        totals: { visitors: Number(totals[0]?.[0] ?? 0), views: Number(totals[0]?.[1] ?? 0), sessions: Number(totals[0]?.[2] ?? 0), avgSessionSeconds: Math.round(Number(avgSession[0]?.[0] ?? 0)) },
        daily: daily.map((r) => ({ date: String(r[0]), visitors: Number(r[1]), views: Number(r[2]) })),
        topPages: pages.map((r) => ({ page: String(r[0]), views: Number(r[1]), visitors: Number(r[2]), avgSeconds: timeByPage.has(String(r[0])) ? Math.round(timeByPage.get(String(r[0]))!) : null })),
        platforms: platforms.map((r) => ({ platform: String(r[0]), visitors: Number(r[1]), avgSessionSeconds: sessionByPlatform.has(String(r[0])) ? Math.round(sessionByPlatform.get(String(r[0]))!) : null })),
        webOs: webOs.map((r) => ({ os: String(r[0]), visitors: Number(r[1]) })),
        referrers: referrers.map((r) => ({ source: String(r[0]), visitors: Number(r[1]) })),
      };
      this.cache.set(days, { at: Date.now(), report });
      return report;
    } catch (err) {
      this.logger.warn(`Traffic report failed: ${err instanceof Error ? err.message : String(err)}`);
      return { configured: true, days, error: "TRAFFIC_UNAVAILABLE" };
    }
  }
}
