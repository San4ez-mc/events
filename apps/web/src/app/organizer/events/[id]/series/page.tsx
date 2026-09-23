"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useTranslations } from "@/lib/locale-context";
import { getAccessToken } from "@/lib/api-client";
import type { CreateSeriesResult, EventDetail, EventOccurrence } from "@/lib/event-types";
import { Button } from "@/components/ui/button";

const RECURRENCE_TYPES = [
  "DAILY",
  "EVERY_N_DAYS",
  "WEEKLY",
  "EVERY_N_WEEKS",
  "SPECIFIC_WEEKDAY",
  "SPECIFIC_DAY_OF_MONTH",
  "EVERY_N_MONTHS",
] as const;

/** §29 — turn a draft event into a recurring series; each occurrence is its own independent draft. */
export default function EventSeriesPage() {
  const { id } = useParams<{ id: string }>();
  const { user, isLoading: authLoading } = useAuth();
  const { t } = useTranslations();
  const router = useRouter();

  const [event, setEvent] = useState<EventDetail | null>(null);
  const [occurrences, setOccurrences] = useState<EventOccurrence[] | null>(null);
  const [error, setError] = useState(false);

  const [recurrenceType, setRecurrenceType] = useState<(typeof RECURRENCE_TYPES)[number]>("WEEKLY");
  const [interval, setInterval] = useState("");
  const [count, setCount] = useState("");
  const [until, setUntil] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace(`/login?next=/organizer/events/${id}/series`);
      return;
    }

    let cancelled = false;
    (async () => {
      const token = getAccessToken();
      if (!token) return;
      const eventRes = await fetch(`/api/v1/events/${id}`, { headers: { Authorization: `Bearer ${token}` } });
      if (cancelled) return;
      if (!eventRes.ok) {
        setError(true);
        return;
      }
      const eventBody = (await eventRes.json()) as EventDetail;
      setEvent(eventBody);

      if (eventBody.seriesId) {
        const occRes = await fetch(`/api/v1/event-series/${eventBody.seriesId}/occurrences`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!cancelled && occRes.ok) {
          setOccurrences((await occRes.json()) as EventOccurrence[]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authLoading, user, id, router]);

  async function createSeries() {
    const token = getAccessToken();
    if (!token) return;
    setCreating(true);
    setCreateError(null);
    try {
      const res = await fetch(`/api/v1/events/${id}/series`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          recurrenceType,
          interval: interval ? Number(interval) : undefined,
          count: count ? Number(count) : undefined,
          until: until ? new Date(until).toISOString() : undefined,
        }),
      });
      if (!res.ok) {
        setCreateError(t("common.somethingWentWrong"));
        return;
      }
      const result = (await res.json()) as CreateSeriesResult;
      setOccurrences(result.occurrences);
      setEvent((prev) => (prev ? { ...prev, seriesId: result.series.id } : prev));
    } finally {
      setCreating(false);
    }
  }

  if (authLoading || (!user && !error)) return null;

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="mb-2 text-2xl font-bold">{t("organizerSeries.title")}</h1>
      <p className="mb-6 text-sm text-muted">{t("organizerSeries.description")}</p>

      {error && <p className="text-danger">{t("common.somethingWentWrong")}</p>}
      {!error && event === null && <p className="text-muted">{t("common.loading")}</p>}

      {!error && event !== null && (
        <>
          {event.seriesId ? (
            <p className="mb-6 text-sm text-muted">{t("organizerSeries.alreadyInSeries")}</p>
          ) : !event.startsAt ? (
            <p className="mb-6 text-sm text-danger">{t("organizerSeries.needsStartDate")}</p>
          ) : (
            <div className="mb-8 rounded-lg border border-border p-4">
              <div className="mb-3 flex flex-col gap-1.5">
                <label className="text-sm font-medium">{t("organizerSeries.recurrenceType")}</label>
                <select
                  value={recurrenceType}
                  onChange={(e) => setRecurrenceType(e.target.value as (typeof RECURRENCE_TYPES)[number])}
                  className="rounded-md border border-border bg-background px-3 py-2 text-sm"
                >
                  {RECURRENCE_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {t(`organizerSeries.recurrenceTypeOptions.${type}`)}
                    </option>
                  ))}
                </select>
              </div>

              <div className="mb-3 flex flex-col gap-1.5">
                <label className="text-sm font-medium">{t("organizerSeries.interval")}</label>
                <input
                  type="number"
                  min={1}
                  max={365}
                  value={interval}
                  onChange={(e) => setInterval(e.target.value)}
                  className="rounded-md border border-border bg-background px-3 py-2 text-sm"
                />
              </div>

              <div className="mb-3 flex flex-col gap-1.5">
                <label className="text-sm font-medium">{t("organizerSeries.count")}</label>
                <input
                  type="number"
                  min={1}
                  max={52}
                  value={count}
                  onChange={(e) => setCount(e.target.value)}
                  className="rounded-md border border-border bg-background px-3 py-2 text-sm"
                />
              </div>

              <div className="mb-4 flex flex-col gap-1.5">
                <label className="text-sm font-medium">{t("organizerSeries.until")}</label>
                <input
                  type="date"
                  value={until}
                  onChange={(e) => setUntil(e.target.value)}
                  className="rounded-md border border-border bg-background px-3 py-2 text-sm"
                />
              </div>

              {createError && <p className="mb-3 text-sm text-danger">{createError}</p>}
              <Button loading={creating} onClick={() => void createSeries()}>
                {t("organizerSeries.create")}
              </Button>
            </div>
          )}

          {occurrences && occurrences.length > 0 && (
            <>
              <h2 className="mb-3 font-semibold">{t("organizerSeries.occurrencesTitle")}</h2>
              <ul className="flex flex-col gap-2">
                {occurrences.map((occurrence) => (
                  <li
                    key={occurrence.id}
                    className="flex items-center justify-between rounded-lg border border-border p-3 text-sm"
                  >
                    <span>{occurrence.title}</span>
                    <span className="text-muted">
                      {occurrence.startsAt ? new Date(occurrence.startsAt).toLocaleString() : "—"}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </div>
  );
}
