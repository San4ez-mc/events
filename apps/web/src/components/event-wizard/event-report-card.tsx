"use client";

import { useCallback, useEffect, useState } from "react";
import { getAccessToken, refreshAccessToken } from "@/lib/api-client";
import { useTranslations } from "@/lib/locale-context";
import { Button } from "@/components/ui/button";

interface Participant {
  registrationId: string;
  name: string | null;
  nickname: string | null;
  avatarUrl: string | null;
  attended: boolean;
}
interface ReportState {
  eventEnded: boolean;
  report: { comment: string | null; submittedAt: string; attendedCount: number; registeredCount: number } | null;
  participants: Participant[];
}

async function call(path: string, init: RequestInit = {}, retried = false): Promise<Response> {
  const res = await fetch(`/api/v1${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${getAccessToken() ?? ""}`, ...(init.body ? { "Content-Type": "application/json" } : {}) },
  });
  if (res.status === 401 && !retried && (await refreshAccessToken())) return call(path, init, true);
  return res;
}

/**
 * After the event: who came (everybody starts ticked, the organizer unticks no-shows) and an optional note to the Kiro team
 * about what was missing. The "How did your event go?" notification opens the edit page, which shows this card first.
 * Renders nothing before the event starts, without registrations, or when the viewer may not manage registrations.
 */
export function EventReportCard({ eventId }: { eventId: string }) {
  const { t } = useTranslations();
  const [state, setState] = useState<ReportState | null>(null);
  const [came, setCame] = useState<Set<string>>(new Set());
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [failed, setFailed] = useState(false);

  const apply = useCallback((next: ReportState) => {
    setState(next);
    setCame(new Set(next.participants.filter((p) => p.attended).map((p) => p.registrationId)));
    setComment(next.report?.comment ?? "");
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await call(`/events/${eventId}/registrations/report`);
        if (!res.ok || cancelled) return;
        apply((await res.json()) as ReportState);
      } catch {
        // Stays hidden: the card is optional.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [eventId, apply]);

  async function submit() {
    setBusy(true);
    setFailed(false);
    setSaved(false);
    try {
      const res = await call(`/events/${eventId}/registrations/report`, { method: "PUT", body: JSON.stringify({ attendedIds: [...came], comment: comment.trim() || undefined }) });
      if (!res.ok) throw new Error(String(res.status));
      apply((await res.json()) as ReportState);
      setSaved(true);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  if (!state || !state.eventEnded || (state.participants.length === 0 && !state.report)) return null;

  const toggle = (id: string) =>
    setCame((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <section className="mx-auto mb-4 flex max-w-2xl flex-col gap-3 rounded-[18px] border border-border bg-surface p-4">
      <div>
        <h2 className="text-base font-extrabold">{t("eventReport.title")}</h2>
        <p className="text-sm text-muted">{t("eventReport.hint")}</p>
      </div>
      <p className="text-sm font-bold">{t("eventReport.count").replace("{came}", String(came.size)).replace("{total}", String(state.participants.length))}</p>

      <ul className="flex flex-col">
        {state.participants.map((p) => {
          const on = came.has(p.registrationId);
          return (
            <li key={p.registrationId}>
              <label className="flex cursor-pointer items-center gap-3 py-1.5">
                <input type="checkbox" checked={on} onChange={() => toggle(p.registrationId)} className="h-5 w-5 accent-[var(--accent-from,#8b5cf6)]" />
                {/* eslint-disable-next-line @next/next/no-img-element -- tiny user avatar from an arbitrary host */}
                {p.avatarUrl ? <img src={p.avatarUrl} alt="" className="h-8 w-8 rounded-full object-cover" /> : <span className="h-8 w-8 rounded-full border border-border" aria-hidden="true" />}
                <span className={`truncate text-sm ${on ? "" : "text-muted line-through"}`}>{p.name ?? p.nickname ?? t("eventReport.anonymous")}</span>
              </label>
            </li>
          );
        })}
      </ul>

      <label className="flex flex-col gap-1.5 text-sm font-bold">
        {t("eventReport.feedbackLabel")}
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          maxLength={3000}
          rows={4}
          placeholder={t("eventReport.feedbackPlaceholder")}
          className="rounded-[12px] border border-border bg-background p-3 text-sm font-normal"
        />
      </label>
      {failed && <p className="text-sm text-danger">{t("common.somethingWentWrong")}</p>}
      {saved && <p className="text-sm text-success">{t("eventReport.saved")}</p>}
      <Button loading={busy} onClick={() => void submit()}>
        {state.report ? t("eventReport.update") : t("eventReport.send")}
      </Button>
    </section>
  );
}
