"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useTranslations } from "@/lib/locale-context";
import { getAccessToken } from "@/lib/api-client";
import type { EventStats } from "@/lib/event-types";

const ROWS: { key: keyof EventStats; labelKey: string }[] = [
  { key: "registrations", labelKey: "organizerStats.registrations" },
  { key: "confirmed", labelKey: "organizerStats.confirmed" },
  { key: "cancellations", labelKey: "organizerStats.cancellations" },
  { key: "paymentClicks", labelKey: "organizerStats.paymentClicks" },
  { key: "saves", labelKey: "organizerStats.saves" },
];

/** §35 — on-demand organizer analytics (registrations/confirmations/cancellations/payment-clicks/saves). */
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

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="mb-6 text-2xl font-bold">{t("organizerStats.title")}</h1>

      {error && <p className="text-danger">{t("common.somethingWentWrong")}</p>}
      {!error && stats === null && <p className="text-muted">{t("common.loading")}</p>}

      {!error && stats !== null && (
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          {ROWS.map((row) => (
            <div key={row.key} className="rounded-lg border border-border p-4 text-center">
              <dd className="text-2xl font-bold">{stats[row.key]}</dd>
              <dt className="mt-1 text-xs text-muted">{t(row.labelKey)}</dt>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}
