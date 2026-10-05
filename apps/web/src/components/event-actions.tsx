"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { IoCalendarOutline, IoEllipsisHorizontal, IoHeart, IoHeartOutline, IoShareSocialOutline } from "react-icons/io5";
import { useAuth } from "@/lib/auth-context";
import { useTranslations } from "@/lib/locale-context";
import { getAccessToken } from "@/lib/api-client";
import { track } from "@/lib/analytics";

const REPORT_REASONS = [
  "spam",
  "fraud",
  "inappropriate",
  "wrongInfo",
  "other",
] as const;

/** UX §26 — Save, Share and Report on the event page. Saving/reporting needs an account; sharing never does. */
export function EventActions({
  eventId,
  slug,
  title,
  startsAt,
}: {
  eventId: string;
  slug: string;
  title: string;
  startsAt?: string | null;
}) {
  const { t } = useTranslations();
  const { user } = useAuth();
  const router = useRouter();
  const [saved, setSaved] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [reporting, setReporting] = useState(false);

  // The server-rendered page is anonymous, so the viewer's saved state is loaded here.
  useEffect(() => {
    const token = getAccessToken();
    if (!user || !token) return;
    let cancelled = false;
    (async () => {
      const res = await fetch(
        `/api/v1/events/slug/${encodeURIComponent(slug)}`,
        { headers: { Authorization: `Bearer ${token}` } },
      ).catch(() => null);
      if (res?.ok && !cancelled)
        setSaved(Boolean((await res.json()).viewerSaved));
    })();
    return () => {
      cancelled = true;
    };
  }, [user, slug]);

  function requireLogin(): boolean {
    if (user) return false;
    router.push(`/login?next=${encodeURIComponent(window.location.pathname)}`);
    return true;
  }

  async function toggleSave() {
    if (requireLogin()) return;
    const next = !saved;
    setSaved(next);
    const res = await fetch(`/api/v1/discovery/${eventId}/save`, {
      method: next ? "POST" : "DELETE",
      headers: { Authorization: `Bearer ${getAccessToken() ?? ""}` },
    }).catch(() => null);
    if (!res?.ok) setSaved(!next);
  }

  async function share() {
    const url = window.location.href.split("?")[0]!;
    track(eventId, "SHARE");
    try {
      if (navigator.share) await navigator.share({ title, url });
      else {
        await navigator.clipboard.writeText(url);
        setNotice(t("events.actions.linkCopied"));
        setTimeout(() => setNotice(null), 2500);
      }
    } catch {
      // user dismissed the share sheet
    }
  }

  async function report(reason: (typeof REPORT_REASONS)[number]) {
    setReporting(false);
    const res = await fetch("/api/v1/reports", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${getAccessToken() ?? ""}`,
      },
      body: JSON.stringify({
        targetType: "EVENT",
        targetId: eventId,
        reason: t(`events.actions.reasons.${reason}`),
      }),
    }).catch(() => null);
    setNotice(
      res?.ok ? t("events.actions.reportSent") : t("common.somethingWentWrong"),
    );
    setTimeout(() => setNotice(null), 3500);
  }

  const btn =
    "flex h-11 w-11 items-center justify-center rounded-full border border-border bg-surface text-foreground transition hover:border-[var(--accent-from)]/50 active:scale-90";

  return (
    <div className="relative">
      <div className="flex flex-wrap items-center gap-2.5">
        <button
          type="button"
          onClick={toggleSave}
          aria-pressed={saved}
          aria-label={saved ? t("events.actions.saved") : t("events.actions.save")}
          title={saved ? t("events.actions.saved") : t("events.actions.save")}
          className={btn}
        >
          {saved ? (
            <IoHeart className="h-[22px] w-[22px] text-[var(--accent-to)]" aria-hidden="true" />
          ) : (
            <IoHeartOutline className="h-[22px] w-[22px]" aria-hidden="true" />
          )}
        </button>
        {startsAt && (
          <a
            href={`/api/v1/events/${eventId}/calendar.ics`}
            download
            aria-label={t("events.actions.addToCalendar")}
            title={t("events.actions.addToCalendar")}
            className={btn}
          >
            <IoCalendarOutline className="h-5 w-5" aria-hidden="true" />
          </a>
        )}
        <button type="button" onClick={share} aria-label={t("events.actions.share")} title={t("events.actions.share")} className={btn}>
          <IoShareSocialOutline className="h-[22px] w-[22px]" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={() => {
            if (!requireLogin()) setReporting((v) => !v);
          }}
          className={btn}
          aria-expanded={reporting}
          aria-label={t("events.actions.report")}
          title={t("events.actions.report")}
        >
          <IoEllipsisHorizontal className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>
      {reporting && (
        <ul className="absolute left-0 z-10 mt-2 w-64 overflow-hidden rounded-[14px] border border-border bg-surface shadow-lg">
          {REPORT_REASONS.map((reason) => (
            <li key={reason}>
              <button
                type="button"
                onClick={() => void report(reason)}
                className="block w-full px-4 py-2.5 text-left text-sm hover:bg-background"
              >
                {t(`events.actions.reasons.${reason}`)}
              </button>
            </li>
          ))}
        </ul>
      )}
      {notice && (
        <p role="status" className="mt-2 text-sm text-muted">
          {notice}
        </p>
      )}
    </div>
  );
}
