"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useTranslations } from "@/lib/locale-context";
import { getAccessToken } from "@/lib/api-client";
import type { EventStats } from "@/lib/event-types";

const FUNNEL: { key: keyof EventStats; labelKey: string }[] = [
  { key: "impressions", labelKey: "organizerStats.impressions" },
  { key: "views", labelKey: "organizerStats.views" },
  { key: "saves", labelKey: "organizerStats.saves" },
  { key: "shares", labelKey: "organizerStats.shares" },
  { key: "registrations", labelKey: "organizerStats.registrations" },
  { key: "confirmed", labelKey: "organizerStats.confirmed" },
  { key: "paymentClicks", labelKey: "organizerStats.paymentClicks" },
  { key: "cancellations", labelKey: "organizerStats.cancellations" },
];

const SOURCE_LABEL: Record<string, string> = {
  SWIPE: "organizerStats.sourceSwipe",
  SEARCH: "organizerStats.sourceSearch",
  DIRECT: "organizerStats.sourceDirect",
  PROFILE: "organizerStats.sourceProfile",
  THREADS: "organizerStats.sourceThreads",
  OTHER: "organizerStats.sourceOther",
};

/** §35/§47 — organizer analytics: funnel (impressions -> views -> registrations), traffic sources, daily views. Aggregates only — never who viewed. */
export default function EventStatsPage() {
  const { id } = useParams<{ id: string }>();
  const { user, isLoading: authLoading } = useAuth();
  const { t } = useTranslations();
  const router = useRouter();

  const [stats, setStats] = useState<EventStats | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace(`/login?next=/organizer/events/${id}/stats`);
      return;
    }

    let cancelled = false;
    (async () => {
      const token = getAccessToken();
      if (!token) return;
      const res = await fetch(`/api/v1/events/${id}/stats`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (cancelled) return;
      if (!res.ok) {
        setError(true);
        return;
      }
      setStats((await res.json()) as EventStats);
    })();
    return () => {
      cancelled = true;
    };
  }, [authLoading, user, id, router]);

  if (authLoading || (!user && !error)) return null;

  const sources = Object.entries(stats?.viewsBySource ?? {}).sort(
    (a, b) => b[1] - a[1],
  );
  const sourceTotal = sources.reduce((sum, [, n]) => sum + n, 0);
  const daily = stats?.daily ?? [];
  const maxViews = Math.max(1, ...daily.map((d) => d.views));

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="mb-6 text-2xl font-bold">{t("organizerStats.title")}</h1>

      {error && <p className="text-danger">{t("common.somethingWentWrong")}</p>}
      {!error && stats === null && (
        <p className="text-muted">{t("common.loading")}</p>
      )}

      {!error && stats !== null && (
        <div className="flex flex-col gap-8">
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {FUNNEL.map((row) => (
              <div
                key={row.key}
                className="rounded-2xl border border-border p-4 text-center"
              >
                <dd className="text-2xl font-bold">
                  {(stats[row.key] as number | undefined) ?? 0}
                </dd>
                <dt className="mt-1 text-xs text-muted">{t(row.labelKey)}</dt>
              </div>
            ))}
          </dl>

          <div className="accent-gradient rounded-2xl p-5 text-white">
            <p className="text-sm opacity-90">
              {t("organizerStats.conversion")}
            </p>
            <p className="text-3xl font-extrabold">
              {stats.conversionViewToRegistration === null ||
              stats.conversionViewToRegistration === undefined
                ? "—"
                : `${stats.conversionViewToRegistration}%`}
            </p>
          </div>

          <section>
            <h2 className="mb-3 text-sm font-semibold">
              {t("organizerStats.sources")}
            </h2>
            {sources.length === 0 ? (
              <p className="text-sm text-muted">
                {t("organizerStats.noViewsYet")}
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {sources.map(([source, count]) => (
                  <li key={source} className="flex items-center gap-3 text-sm">
                    <span className="w-28 shrink-0">
                      {t(SOURCE_LABEL[source] ?? "organizerStats.sourceOther")}
                    </span>
                    <span className="h-2 flex-1 overflow-hidden rounded-full bg-surface">
                      <span
                        className="accent-gradient block h-full rounded-full"
                        style={{ width: `${(count / sourceTotal) * 100}%` }}
                      />
                    </span>
                    <span className="w-10 text-right font-semibold">
                      {count}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {daily.length > 0 && (
            <section>
              <h2 className="mb-3 text-sm font-semibold">
                {t("organizerStats.dailyViews")}
              </h2>
              <div
                className="flex h-28 items-end gap-1"
                role="img"
                aria-label={t("organizerStats.dailyViews")}
              >
                {daily.map((d) => (
                  <div
                    key={d.date}
                    className="group relative flex-1"
                    title={`${d.date}: ${d.views}`}
                  >
                    <div
                      className="accent-gradient w-full rounded-t"
                      style={{
                        height: `${Math.max(4, (d.views / maxViews) * 100)}%`,
                      }}
                    />
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
