"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Bookmark, Flag, Share2 } from "lucide-react";
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
}: {
  eventId: string;
  slug: string;
  title: string;
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
    "inline-flex min-h-10 items-center gap-2 rounded-full border border-border px-4 text-sm font-medium hover:bg-surface";

  return (
    <div className="relative">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={toggleSave}
          aria-pressed={saved}
          className={btn}
        >
          <Bookmark
            className="h-4 w-4"
            fill={saved ? "currentColor" : "none"}
            aria-hidden="true"
          />
          {saved ? t("events.actions.saved") : t("events.actions.save")}
        </button>
        <button type="button" onClick={share} className={btn}>
          <Share2 className="h-4 w-4" aria-hidden="true" />
          {t("events.actions.share")}
        </button>
        <button
          type="button"
          onClick={() => {
            if (!requireLogin()) setReporting((v) => !v);
          }}
          className={btn}
          aria-expanded={reporting}
        >
          <Flag className="h-4 w-4" aria-hidden="true" />
          {t("events.actions.report")}
        </button>
      </div>
      {reporting && (
        <ul className="absolute left-0 z-10 mt-2 w-64 overflow-hidden rounded-2xl border border-border bg-background shadow-lg">
          {REPORT_REASONS.map((reason) => (
            <li key={reason}>
              <button
                type="button"
                onClick={() => void report(reason)}
                className="block w-full px-4 py-2.5 text-left text-sm hover:bg-surface"
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
