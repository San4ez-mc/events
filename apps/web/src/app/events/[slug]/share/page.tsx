"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { IoMegaphone } from "react-icons/io5";
import { SYSTEM_SETTING_DEFAULTS, SystemSettingKey } from "@kiro/types";
import { useAuth } from "@/lib/auth-context";
import { useTranslations } from "@/lib/locale-context";
import { getAccessToken } from "@/lib/api-client";
import { captureEvent } from "@/lib/product-analytics";
import { formatDateTime } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/text-field";
import { Spinner } from "@/components/ui/spinner";

interface EventLite {
  id: string;
  slug: string;
  title: string;
  status: string;
}
interface Claim {
  id: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  createdAt: string;
  event: { title: string } | null;
}

const BONUS_CREDITS = SYSTEM_SETTING_DEFAULTS[SystemSettingKey.REFERRAL_BONUS_CREDITS] as number;
const VARIANTS = [1, 2, 3] as const;
/** One tagged link per channel, so analytics can tell which network an organizer's post brought visitors from. */
const CHANNELS = [
  { source: "threads", label: "Threads" },
  { source: "instagram", label: "Instagram" },
  { source: "telegram", label: "Telegram" },
  { source: "facebook", label: "Facebook" },
] as const;

/**
 * Story / post pictures for an event (the same three designs as the app), reachable straight from publishing and from
 * the event page: most organizers never find the "…" menu where this used to live. The images are server-made and public
 * (GET /events/:id/share-image); only claiming credits for a post needs an account.
 */
export default function ShareEventPage() {
  const { slug } = useParams<{ slug: string }>();
  const { user, isLoading: authLoading } = useAuth();
  const { t, locale } = useTranslations();
  const [event, setEvent] = useState<EventLite | null | undefined>(undefined);
  const [justPublished, setJustPublished] = useState(false);
  const [format, setFormat] = useState<"story" | "post">("story");
  const [variant, setVariant] = useState<(typeof VARIANTS)[number]>(1);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [claims, setClaims] = useState<Claim[] | null>(null);

  useEffect(() => {
    const published = new URLSearchParams(window.location.search).get("published") === "1";
    queueMicrotask(() => setJustPublished(published));
    let cancelled = false;
    (async () => {
      const res = await fetch(`/api/v1/events/slug/${encodeURIComponent(slug)}`, { headers: { Authorization: `Bearer ${getAccessToken() ?? ""}` } }).catch(() => null);
      if (cancelled) return;
      if (!res?.ok) return setEvent(null);
      const body = (await res.json()) as EventLite;
      setEvent(body);
      captureEvent("share_page_open", { event_id: body.id, just_published: published });
    })();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  const loadClaims = useCallback(async () => {
    const token = getAccessToken();
    if (!token) return;
    const res = await fetch("/api/v1/referrals/mine", { headers: { Authorization: `Bearer ${token}` } }).catch(() => null);
    if (res?.ok) setClaims((await res.json()) as Claim[]);
  }, []);

  useEffect(() => {
    if (user) queueMicrotask(() => void loadClaims());
  }, [user, loadClaims]);

  if (event === undefined) return <div className="mx-auto max-w-2xl px-4 py-16"><Spinner /></div>;
  if (event === null || (event.status !== "PUBLISHED" && event.status !== "COMPLETED")) {
    return <p className="mx-auto max-w-2xl px-4 py-16 text-center text-muted">{t("common.somethingWentWrong")}</p>;
  }

  const image = (v: number, share = false) => `/api/v1/events/${event.id}/share-image?variant=${v}&format=${format}${share ? "&share=1" : ""}`;
  const eventUrl = `${window.location.origin}/events/${event.slug}?utm_source=share_card&utm_medium=social`;
  const fileName = `kiro-${event.slug}-${format}-${variant}.jpg`;

  async function shareOrDownload() {
    setBusy(true);
    setMessage(null);
    captureEvent("share_image_download", { event_id: event!.id, variant, format });
    try {
      const res = await fetch(image(variant, true));
      if (!res.ok) throw new Error(String(res.status));
      const blob = await res.blob();
      const file = new File([blob], fileName, { type: "image/jpeg" });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: event!.title, url: eventUrl }).catch(() => undefined);
      } else {
        const href = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = href;
        a.download = fileName;
        a.click();
        URL.revokeObjectURL(href);
      }
    } catch {
      setMessage(t("referral.shareFailed"));
    } finally {
      setBusy(false);
    }
  }

  const linkFor = (source: string) => `${window.location.origin}/events/${event!.slug}?utm_source=${source}&utm_medium=social`;

  async function copyLink(source: string) {
    try {
      await navigator.clipboard.writeText(linkFor(source));
      captureEvent("share_link_copied", { event_id: event!.id, channel: source });
      setCopied(source);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      // clipboard blocked — the link is shown on screen anyway
    }
  }

  async function submitClaim() {
    const token = getAccessToken();
    if (!token) return;
    setSubmitting(true);
    setMessage(null);
    try {
      const res = await fetch("/api/v1/referrals", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ eventId: event!.id, note: note.trim() || undefined }),
      });
      if (res.ok) {
        setNote("");
        captureEvent("referral_submitted", { from: "web_share_page", event_id: event!.id });
        setMessage(t("referral.submitted"));
        await loadClaims();
      } else {
        setMessage(t("common.somethingWentWrong"));
      }
    } finally {
      setSubmitting(false);
    }
  }

  const chip = (on: boolean) => `rounded-full border px-4 py-1.5 text-sm font-semibold ${on ? "accent-gradient border-transparent text-white" : "border-border"}`;
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5 px-4 py-8 pb-28">
      {justPublished && <p className="rounded-[14px] border border-[var(--accent-from)] bg-surface px-4 py-3 text-sm">{t("referral.publishedBanner")}</p>}

      <div>
        <h1 className="flex items-center gap-2 text-2xl font-extrabold">
          <IoMegaphone className="h-6 w-6 text-[var(--accent-from)]" aria-hidden="true" />
          {t("referral.createStory")}
        </h1>
        <p className="mt-1 text-sm text-muted">{event.title}</p>
      </div>

      <div>
        <p className="mb-2 text-sm font-semibold">{t("referral.chooseDesign")}</p>
        <div className="mb-3 flex gap-2">
          {(["story", "post"] as const).map((f) => (
            <button key={f} type="button" onClick={() => setFormat(f)} className={chip(format === f)}>
              {t(f === "story" ? "referral.formatStory" : "referral.formatPost")}
            </button>
          ))}
        </div>
        <div className="flex gap-3 overflow-x-auto pb-2">
          {VARIANTS.map((v) => (
            <button key={v} type="button" onClick={() => setVariant(v)} className="shrink-0 text-center" aria-pressed={variant === v}>
              {/* eslint-disable-next-line @next/next/no-img-element -- server-generated preview, no optimisation wanted */}
              <img
                src={image(v)}
                alt={t(`referral.design${v}`)}
                loading="lazy"
                className={`w-[168px] rounded-[16px] border-[3px] bg-surface object-cover sm:w-[200px] ${format === "post" ? "aspect-[1080/1350]" : "aspect-[1080/1920]"} ${variant === v ? "border-[var(--accent-from)]" : "border-transparent"}`}
              />
              <span className={`mt-1 block text-sm font-bold ${variant === v ? "text-[var(--accent-from)]" : "text-muted"}`}>{t(`referral.design${v}`)}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-3 rounded-[14px] border border-border bg-surface p-4">
        <p className="text-sm leading-relaxed">{t("referral.instructions").replace("{count}", String(BONUS_CREDITS))}</p>
        <div className="flex flex-wrap gap-2">
          <Button loading={busy} onClick={() => void shareOrDownload()}>
            {t("referral.download")} / {t("events.actions.share")}
          </Button>
        </div>
        <p className="text-xs font-semibold text-muted">{t("referral.copyLinkFor")}</p>
        <div className="flex flex-wrap gap-2">
          {CHANNELS.map((c) => (
            <Button key={c.source} variant="secondary" onClick={() => void copyLink(c.source)}>
              {copied === c.source ? t("events.actions.linkCopied") : `🔗 ${c.label}`}
            </Button>
          ))}
        </div>
        <p className="break-all text-xs text-muted">{eventUrl}</p>
        {message && <p role="status" className="text-sm text-muted">{message}</p>}
      </div>

      {!authLoading && !user && (
        <p className="text-sm text-muted">
          <Link href={`/login?next=${encodeURIComponent(`/events/${event.slug}/share`)}`} className="font-semibold text-[var(--accent-from)] underline">
            {t("referral.loginToClaim")}
          </Link>
        </p>
      )}

      {user && (
        <div className="flex flex-col gap-3 rounded-[14px] border border-border bg-surface p-4">
          <TextField label={t("referral.noteLabel")} value={note} onChange={setNote} placeholder={t("referral.notePlaceholder")} />
          <Button variant="secondary" loading={submitting} onClick={() => void submitClaim()}>
            {t("referral.submit")}
          </Button>
          {claims && claims.length > 0 && (
            <ul className="mt-1 flex flex-col gap-2">
              {claims.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-3 text-sm">
                  <span className="min-w-0 truncate">
                    {c.event?.title ?? t("referral.generalClaim")} <span className="text-xs text-muted">{formatDateTime(c.createdAt, locale)}</span>
                  </span>
                  <span className="shrink-0 rounded-full bg-background px-2.5 py-1 text-xs font-bold">{t(`referral.status.${c.status}`)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
