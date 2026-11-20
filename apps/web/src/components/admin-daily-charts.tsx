"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "@/lib/locale-context";
import { getAccessToken } from "@/lib/api-client";
import { Spinner } from "@/components/ui/spinner";
import { periodQuery, type Period } from "@/components/admin-period";

interface TrafficDaily {
  configured: boolean;
  daily?: { date: string; visitors: number; views: number }[];
}
interface Daily {
  days: string[];
  series: {
    newUsers: number[];
    registrations: number[];
    placementsApp: number[];
    placementsImported: number[];
    eventViews: number[];
    saves: number[];
    ticketClicks: number[];
    shares: number[];
  };
}

const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);
/** "2026-10-28" -> "28.10". */
const short = (day: string) => `${Number(day.slice(8))}.${day.slice(5, 7)}`;

/**
 * The charts at the very top of the analytics, as in the app: visitors per day first (the one looked at most), then page
 * views, new accounts, listings placed, event views, ticket clicks, registrations, saves and shares.
 */
export function AdminDailyCharts({ period }: { period: Period }) {
  const { t } = useTranslations();
  const [traffic, setTraffic] = useState<TrafficDaily | null>(null);
  const [daily, setDaily] = useState<Daily | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      setTraffic(null);
      setDaily(null);
      setFailed(false);
    });
    const headers = { Authorization: `Bearer ${getAccessToken() ?? ""}` };
    const query = periodQuery(period);
    (async () => {
      const [trafficRes, dailyRes] = await Promise.all([
        fetch(`/api/v1/admin/analytics/traffic?${query}`, { headers }).catch(() => null),
        fetch(`/api/v1/admin/analytics/daily?${query}`, { headers }).catch(() => null),
      ]);
      const trafficBody = trafficRes?.ok ? ((await trafficRes.json()) as TrafficDaily) : { configured: false };
      const dailyBody = dailyRes?.ok ? ((await dailyRes.json()) as Daily) : null;
      if (cancelled) return;
      setTraffic(trafficBody);
      if (dailyBody) setDaily(dailyBody);
      else setFailed(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [period.from, period.to]);

  if (failed) return <p className="mb-6 text-sm text-danger">{t("common.somethingWentWrong")}</p>;
  if (!daily || !traffic) return <Spinner />;

  const byDate = new Map((traffic.daily ?? []).map((d) => [d.date, d]));
  const visitors = daily.days.map((d) => byDate.get(d)?.visitors ?? 0);
  const views = daily.days.map((d) => byDate.get(d)?.views ?? 0);
  const s = daily.series;
  const d = (key: string) => t(`admin.daily.${key}`);

  return (
    <div className="mb-8 flex flex-col gap-3">
      <Chart title={d("visitors")} hint={traffic.configured ? undefined : t("admin.traffic.notConfigured")} values={visitors} days={daily.days} tall />
      <div className="grid grid-cols-2 gap-3">
        <Chart title={d("views")} values={views} days={daily.days} />
        <Chart title={d("newUsers")} values={s.newUsers} days={daily.days} />
        <Chart title={d("placements")} values={s.placementsApp} extra={s.placementsImported} legend={[d("placementsApp"), d("placementsImported")]} days={daily.days} />
        <Chart title={d("eventViews")} values={s.eventViews} days={daily.days} />
        <Chart title={d("ticketClicks")} values={s.ticketClicks} days={daily.days} />
        <Chart title={d("registrations")} values={s.registrations} days={daily.days} />
        <Chart title={d("saves")} values={s.saves} days={daily.days} />
        <Chart title={d("shares")} values={s.shares} days={daily.days} />
      </div>
    </div>
  );
}

function Chart({ title, hint, values, extra, legend, days, tall }: { title: string; hint?: string; values: number[]; extra?: number[]; legend?: string[]; days: string[]; tall?: boolean }) {
  const totals = values.map((v, i) => v + (extra?.[i] ?? 0));
  const max = Math.max(1, ...totals);
  const total = sum(totals);
  return (
    <div className={`flex flex-col gap-1 rounded-xl bg-surface p-3 ${tall ? "" : "min-w-0"}`}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="truncate text-[13px] font-bold">{title}</h3>
        <span className={tall ? "text-[22px] font-extrabold" : "text-[15px] font-extrabold"}>{total}</span>
      </div>
      <div className={`mt-1 flex items-end gap-px ${tall ? "h-28" : "h-14"}`} role="img" aria-label={`${title}: ${total}`}>
        {days.map((day, i) => {
          const main = values[i] ?? 0;
          const top = extra?.[i] ?? 0;
          return (
            <div key={day} title={`${short(day)}: ${main + top}`} className="flex h-full min-w-0 flex-1 flex-col justify-end">
              {top > 0 && <div className="w-full bg-[var(--accent-to)]" style={{ height: `${(top / max) * 100}%` }} />}
              <div className="w-full rounded-t-sm bg-[var(--accent-from)]" style={{ height: main > 0 ? `${Math.max(3, (main / max) * 100)}%` : 2, opacity: main > 0 ? 1 : 0.25 }} />
            </div>
          );
        })}
      </div>
      <div className="flex justify-between text-[10px] text-muted">
        <span>{short(days[0] ?? "")}</span>
        <span>{`max ${total === 0 ? 0 : max}`}</span>
        <span>{short(days[days.length - 1] ?? "")}</span>
      </div>
      {legend && (
        <div className="flex flex-wrap gap-3 text-[10px] text-muted">
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-[var(--accent-from)]" />
            {legend[0]}
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-[var(--accent-to)]" />
            {legend[1]}
          </span>
        </div>
      )}
      {hint && <p className="text-[10px] text-muted">{hint}</p>}
    </div>
  );
}
