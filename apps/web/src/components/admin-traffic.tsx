"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "@/lib/locale-context";
import { getAccessToken } from "@/lib/api-client";

interface TrafficReport {
  configured: boolean;
  days: number;
  totals?: { visitors: number; views: number; sessions: number; avgSessionSeconds: number };
  daily?: { date: string; visitors: number; views: number }[];
  topPages?: { page: string; views: number; visitors: number; avgSeconds: number | null }[];
  platforms?: { platform: string; visitors: number; avgSessionSeconds: number | null }[];
  referrers?: { source: string; visitors: number }[];
  webOs?: { os: string; visitors: number }[];
  error?: string;
}

const DAYS = 30;

/** 95 → "1:35", 3700 → "1:01:40". */
function formatDuration(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}

/** Site + app visitors from PostHog, via the API's /admin/analytics/traffic (the personal API key never reaches the browser). */
export function AdminTraffic() {
  const { t } = useTranslations();
  const [report, setReport] = useState<TrafficReport | null>(null);

  useEffect(() => {
    const token = getAccessToken();
    if (!token) return;
    (async () => {
      try {
        const res = await fetch(`/api/v1/admin/analytics/traffic?days=${DAYS}`, { headers: { Authorization: `Bearer ${token}` } });
        setReport(res.ok ? await res.json() : { configured: true, days: DAYS, error: "TRAFFIC_UNAVAILABLE" });
      } catch {
        setReport({ configured: true, days: DAYS, error: "TRAFFIC_UNAVAILABLE" });
      }
    })();
  }, []);

  const maxVisitors = Math.max(1, ...(report?.daily ?? []).map((d) => d.visitors));

  return (
    <section className="mb-10">
      <h2 className="mb-1 text-lg font-bold">{t("admin.traffic.title")}</h2>
      <p className="mb-4 text-xs text-muted">{t("admin.traffic.period").replace("{days}", String(DAYS))}</p>

      {report === null && <p className="text-muted">{t("common.loading")}</p>}
      {report && !report.configured && <p className="rounded-lg border border-border p-4 text-sm text-muted">{t("admin.traffic.notConfigured")}</p>}
      {report?.error && <p className="text-sm text-danger">{t("admin.traffic.unavailable")}</p>}

      {report?.totals && (
        <>
          <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Tile label={t("admin.traffic.visitors")} value={report.totals.visitors} />
            <Tile label={t("admin.traffic.views")} value={report.totals.views} />
            <Tile label={t("admin.traffic.sessions")} value={report.totals.sessions} />
            <Tile label={t("admin.traffic.avgSession")} value={formatDuration(report.totals.avgSessionSeconds)} />
          </div>

          {report.daily && report.daily.length > 0 && (
            <>
              <h3 className="mb-2 text-sm font-semibold">{t("admin.traffic.daily")}</h3>
              <div className="mb-6 flex h-28 items-end gap-1 rounded-lg border border-border p-3" role="img" aria-label={t("admin.traffic.daily")}>
                {report.daily.map((d) => (
                  <div
                    key={d.date}
                    title={`${d.date}: ${d.visitors}`}
                    className="accent-gradient min-h-[2px] flex-1 rounded-t"
                    style={{ height: `${Math.max(2, (d.visitors / maxVisitors) * 100)}%` }}
                  />
                ))}
              </div>
            </>
          )}

          <div className="grid gap-6 sm:grid-cols-2">
            <List title={t("admin.traffic.topPages")} hint={t("admin.traffic.topPagesHint")} empty={t("admin.traffic.empty")} rows={(report.topPages ?? []).map((p) => ({ key: p.page, label: p.page, value: `${p.views} · ${p.visitors}${p.avgSeconds !== null ? ` · ${formatDuration(p.avgSeconds)}` : ""}` }))} />
            <div className="flex flex-col gap-6">
              <List title={t("admin.traffic.platforms")} hint={t("admin.traffic.platformsHint")} empty={t("admin.traffic.empty")} rows={(report.platforms ?? []).map((p) => ({ key: p.platform, label: t(`admin.traffic.platformNames.${p.platform}`) === `admin.traffic.platformNames.${p.platform}` ? p.platform : t(`admin.traffic.platformNames.${p.platform}`), value: `${p.visitors}${p.avgSessionSeconds !== null ? ` · ${formatDuration(p.avgSessionSeconds)}` : ""}` }))} />
              <List title={t("admin.traffic.webOs")} hint={t("admin.traffic.webOsHint")} empty={t("admin.traffic.empty")} rows={(report.webOs ?? []).map((o) => ({ key: o.os, label: o.os, value: String(o.visitors) }))} />
              <List
                title={t("admin.traffic.sources")}
                empty={t("admin.traffic.empty")}
                rows={(report.referrers ?? []).map((r) => ({ key: r.source, label: r.source === "$direct" ? t("admin.traffic.direct") : r.source, value: String(r.visitors) }))}
              />
            </div>
          </div>
        </>
      )}
    </section>
  );
}

function Tile({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-lg border border-border p-4 text-center">
      <p className="text-2xl font-bold">{value}</p>
      <p className="mt-1 text-xs text-muted">{label}</p>
    </div>
  );
}

function List({ title, hint, rows, empty }: { title: string; hint?: string; rows: { key: string; label: string; value: string }[]; empty: string }) {
  return (
    <div>
      <h3 className="text-sm font-semibold">{title}</h3>
      {hint && <p className="mb-2 text-xs text-muted">{hint}</p>}
      {!hint && <div className="mb-2" />}
      {rows.length === 0 && <p className="text-xs text-muted">{empty}</p>}
      <ul className="flex flex-col gap-1.5 text-sm">
        {rows.map((r) => (
          <li key={r.key} className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2">
            <span className="truncate">{r.label}</span>
            <span className="shrink-0 text-muted">{r.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
