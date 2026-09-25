"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "@/lib/locale-context";
import { getAccessToken } from "@/lib/api-client";
import type { AdminAnalyticsSummary } from "@/lib/admin-types";

export default function AdminDashboardPage() {
  const { t } = useTranslations();
  const [summary, setSummary] = useState<AdminAnalyticsSummary | null>(null);

  useEffect(() => {
    const token = getAccessToken();
    if (!token) return;
    (async () => {
      const res = await fetch("/api/v1/admin/analytics", { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) setSummary(await res.json());
    })();
  }, []);

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="mb-6 text-2xl font-bold">{t("admin.dashboard.title")}</h1>

      {summary === null && <p className="text-muted">{t("common.loading")}</p>}

      {summary !== null && (
        <>
          <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Stat label={t("admin.dashboard.totalUsers")} value={summary.totalUsers} />
            <Stat label={t("admin.dashboard.totalOrganizers")} value={summary.totalOrganizers} />
            <Stat label={t("admin.dashboard.totalRegistrations")} value={summary.totalRegistrations} />
            <Stat label={t("admin.dashboard.totalRevenue")} value={`${summary.totalRevenue} UAH`} />
            <Stat label={t("admin.dashboard.openReports")} value={summary.openReports} />
            <Stat label={t("admin.dashboard.pendingModeration")} value={summary.pendingModeration} />
          </div>

          <h2 className="mb-3 text-sm font-semibold">{t("admin.dashboard.funnel30d")}</h2>
          <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-5">
            <Stat label={t("organizerStats.impressions")} value={summary.funnel30d.impressions} />
            <Stat label={t("organizerStats.views")} value={summary.funnel30d.views} />
            <Stat label={t("organizerStats.saves")} value={summary.funnel30d.saves} />
            <Stat label={t("organizerStats.shares")} value={summary.funnel30d.shares} />
            <Stat label={t("organizerStats.registrations")} value={summary.funnel30d.registrations} />
          </div>

          {summary.topEvents30d.length > 0 && (
            <>
              <h2 className="mb-3 text-sm font-semibold">{t("admin.dashboard.topEvents")}</h2>
              <ol className="mb-8 flex flex-col gap-2 text-sm">
                {summary.topEvents30d.map((e) => (
                  <li key={e.id} className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
                    <span className="truncate">{e.title}</span>
                    <span className="shrink-0 text-muted">
                      {e.views} · {e.registrations}
                    </span>
                  </li>
                ))}
              </ol>
            </>
          )}

          <h2 className="mb-3 text-sm font-semibold">{t("admin.dashboard.eventsByStatus")}</h2>
          <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
            {Object.entries(summary.eventsByStatus).map(([status, count]) => (
              <div key={status} className="rounded-lg border border-border p-3">
                <dt className="text-xs text-muted">{status}</dt>
                <dd className="text-lg font-bold">{count}</dd>
              </div>
            ))}
          </dl>
        </>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-border p-4 text-center">
      <p className="text-2xl font-bold">{value}</p>
      <p className="mt-1 text-xs text-muted">{label}</p>
    </div>
  );
}
