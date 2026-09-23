"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "@/lib/locale-context";
import { getAccessToken } from "@/lib/api-client";
import type { AuditLogEntry, CursorPage } from "@/lib/admin-types";

export default function AdminAuditPage() {
  const { t, locale } = useTranslations();
  const [entries, setEntries] = useState<AuditLogEntry[] | null>(null);

  const load = useCallback(async () => {
    const token = getAccessToken();
    if (!token) return;
    const res = await fetch("/api/v1/admin/audit", { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) setEntries((await res.json() as CursorPage<AuditLogEntry>).items);
  }, []);

  useEffect(() => {
    queueMicrotask(() => void load());
  }, [load]);

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="mb-6 text-2xl font-bold">{t("admin.audit.title")}</h1>

      {entries === null && <p className="text-muted">{t("common.loading")}</p>}
      {entries !== null && entries.length === 0 && <p className="text-muted">{t("admin.audit.empty")}</p>}

      {entries !== null && entries.length > 0 && (
        <ul className="flex flex-col gap-2 text-sm">
          {entries.map((entry) => (
            <li key={entry.id} className="rounded-lg border border-border p-3">
              <div className="mb-1 flex items-center justify-between">
                <span className="font-medium">{entry.action}</span>
                <span className="text-xs text-muted">
                  {new Date(entry.createdAt).toLocaleString(locale === "uk" ? "uk-UA" : "en-US")}
                </span>
              </div>
              <p className="text-xs text-muted">
                {entry.entityType} · {entry.entityId}
              </p>
              {entry.actor && (
                <p className="text-xs text-muted">
                  {t("admin.audit.actor")}: {entry.actor.name ?? entry.actor.nickname ?? entry.actor.email}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
