"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "@/lib/locale-context";
import { getAccessToken } from "@/lib/api-client";
import type { ModerationCase } from "@/lib/admin-types";
import { Button } from "@/components/ui/button";

export default function AdminModerationPage() {
  const { t, locale } = useTranslations();
  const [cases, setCases] = useState<ModerationCase[] | null>(null);
  const [actingId, setActingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const token = getAccessToken();
    if (!token) return;
    const res = await fetch("/api/v1/admin/moderation", { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) setCases(await res.json());
  }, []);

  useEffect(() => {
    queueMicrotask(() => void load());
  }, [load]);

  async function act(caseId: string, action: "approve" | "reject") {
    const token = getAccessToken();
    if (!token) return;
    setActingId(caseId);
    try {
      const res = await fetch(`/api/v1/admin/moderation/${caseId}/${action}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setCases((prev) => (prev ? prev.filter((c) => c.id !== caseId) : prev));
    } finally {
      setActingId(null);
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="mb-6 text-2xl font-bold">{t("admin.moderation.title")}</h1>

      {cases === null && <p className="text-muted">{t("common.loading")}</p>}
      {cases !== null && cases.length === 0 && <p className="text-muted">{t("admin.moderation.empty")}</p>}

      {cases !== null && cases.length > 0 && (
        <ul className="flex flex-col gap-3">
          {cases.map((c) => (
            <li key={c.id} className="rounded-lg border border-border p-4">
              <p className="mb-1 text-sm font-medium">
                {c.targetType} · {c.reasonCode}
              </p>
              {c.details && <p className="mb-2 text-sm text-muted">{c.details}</p>}
              <p className="mb-3 text-xs text-muted">{new Date(c.createdAt).toLocaleString(locale === "uk" ? "uk-UA" : "en-US")}</p>
              <div className="flex gap-2">
                <Button loading={actingId === c.id} onClick={() => void act(c.id, "approve")}>
                  {t("admin.moderation.approve")}
                </Button>
                <Button variant="secondary" loading={actingId === c.id} onClick={() => void act(c.id, "reject")}>
                  {t("admin.moderation.reject")}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
