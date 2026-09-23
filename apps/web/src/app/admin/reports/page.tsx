"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "@/lib/locale-context";
import { getAccessToken } from "@/lib/api-client";
import type { CursorPage, Report } from "@/lib/admin-types";
import { Button } from "@/components/ui/button";

export default function AdminReportsPage() {
  const { t, locale } = useTranslations();
  const [reports, setReports] = useState<Report[] | null>(null);
  const [actingId, setActingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const token = getAccessToken();
    if (!token) return;
    const res = await fetch("/api/v1/admin/reports?status=OPEN", { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) setReports((await res.json() as CursorPage<Report>).items);
  }, []);

  useEffect(() => {
    queueMicrotask(() => void load());
  }, [load]);

  async function resolve(reportId: string, status: "RESOLVED" | "DISMISSED", hideTarget: boolean) {
    const token = getAccessToken();
    if (!token) return;
    setActingId(reportId);
    try {
      const res = await fetch(`/api/v1/admin/reports/${reportId}/resolve`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ status, hideTarget }),
      });
      if (res.ok) setReports((prev) => (prev ? prev.filter((r) => r.id !== reportId) : prev));
    } finally {
      setActingId(null);
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="mb-6 text-2xl font-bold">{t("admin.reports.title")}</h1>

      {reports === null && <p className="text-muted">{t("common.loading")}</p>}
      {reports !== null && reports.length === 0 && <p className="text-muted">{t("admin.reports.empty")}</p>}

      {reports !== null && reports.length > 0 && (
        <ul className="flex flex-col gap-3">
          {reports.map((report) => (
            <li key={report.id} className="rounded-lg border border-border p-4">
              <p className="mb-1 text-sm font-medium">
                {t("admin.reports.target")}: {report.targetType} ({report.targetId})
              </p>
              <p className="mb-1 text-sm">{report.reason}</p>
              {report.description && <p className="mb-2 text-sm text-muted">{report.description}</p>}
              <p className="mb-3 text-xs text-muted">
                {report.reporter.name ?? report.reporter.nickname ?? report.reporter.email} ·{" "}
                {new Date(report.createdAt).toLocaleString(locale === "uk" ? "uk-UA" : "en-US")}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button loading={actingId === report.id} onClick={() => void resolve(report.id, "RESOLVED", true)}>
                  {t("admin.reports.resolve")} + {t("admin.reports.hideTarget")}
                </Button>
                <Button
                  variant="secondary"
                  loading={actingId === report.id}
                  onClick={() => void resolve(report.id, "RESOLVED", false)}
                >
                  {t("admin.reports.resolve")}
                </Button>
                <Button
                  variant="secondary"
                  loading={actingId === report.id}
                  onClick={() => void resolve(report.id, "DISMISSED", false)}
                >
                  {t("admin.reports.dismiss")}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
