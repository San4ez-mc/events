"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  IoAddCircleOutline,
  IoAlertCircleOutline,
  IoCalendar,
  IoChevronForward,
  IoCloseCircleOutline,
  IoEyeOutline,
  IoHandLeftOutline,
  IoHeartOutline,
  IoPeopleOutline,
  IoShareSocialOutline,
  IoTicketOutline,
} from "react-icons/io5";
import { useAuth } from "@/lib/auth-context";
import { useTranslations } from "@/lib/locale-context";
import { getAccessToken } from "@/lib/api-client";
import type { CursorPage, EventCard } from "@/lib/event-types";
import { formatCurrency, formatPriceAmount } from "@/lib/format";
import { formatCardDate } from "./event-card";
import { EventResultRow } from "@/components/search/event-result-row";
import { EmptyState, ScreenHeader } from "@/components/ui/screen-header";

type Segment = "saved" | "created";

/** GET /events/mine/analytics: lifetime numbers for one event of mine. */
interface EventAnalytics {
  eventId: string;
  peopleSeen: number;
  peopleOpened: number;
  passes: number;
  saves: number;
  shares: number;
  ticketClicks: number;
  registrations: number;
  openRatePercent: number | null;
}

const asList = <T,>(body: unknown): T[] => (Array.isArray(body) ? (body as T[]) : (((body as CursorPage<T>).items ?? []) as T[]));

async function authedGet(path: string): Promise<Response | null> {
  const token = getAccessToken();
  if (!token) return null;
  return fetch(`/api/v1${path}`, { headers: { Authorization: `Bearer ${token}` } });
}

/**
 * "Мої події", the app's fourth tab (it replaced the heart): the events I saved and the events I created. For every
 * created event the organizer sees how it is doing: how many people saw the card, opened the details, passed, saved,
 * shared and registered, with links to the full statistics, the story/post pictures and the editor.
 */
export function SavedEventsContent() {
  const { t, locale } = useTranslations();
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const [segment, setSegment] = useState<Segment>("saved");
  const [saved, setSaved] = useState<EventCard[] | null>(null);
  const [created, setCreated] = useState<EventCard[] | null>(null);
  const [analytics, setAnalytics] = useState<Record<string, EventAnalytics>>({});
  const [error, setError] = useState(false);
  const [deleteError, setDeleteError] = useState(false);

  /** A draft is deleted for good; any other event disappears from Kiro (registrants are told it was cancelled). Always confirmed first. */
  async function deleteDraft(item: EventCard) {
    const draft = item.status === "DRAFT";
    if (!window.confirm(t(draft ? "myEvents.deleteDraftConfirm" : "myEvents.deleteEventConfirm").replace("{title}", item.title))) return;
    setDeleteError(false);
    const res = await fetch(`/api/v1/events/${item.id}`, { method: "DELETE", headers: { Authorization: `Bearer ${getAccessToken() ?? ""}` } }).catch(() => null);
    if (res?.ok) setCreated((prev) => (prev ? prev.filter((e) => e.id !== item.id) : prev));
    else setDeleteError(true);
  }

  const load = useCallback(async () => {
    try {
      const [savedRes, mineRes, statsRes] = await Promise.all([authedGet("/discovery/saved?limit=50"), authedGet("/events/mine?limit=50"), authedGet("/events/mine/analytics")]);
      if (!savedRes?.ok || !mineRes?.ok) {
        setError(true);
        return;
      }
      setError(false);
      setSaved(asList<EventCard>(await savedRes.json()));
      setCreated(asList<EventCard>(await mineRes.json()));
      if (statsRes?.ok) {
        const rows = (await statsRes.json()) as EventAnalytics[];
        setAnalytics(Object.fromEntries(rows.map((r) => [r.eventId, r])));
      }
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace("/login");
      return;
    }
    queueMicrotask(() => void load());
  }, [authLoading, user, router, load]);

  if (authLoading || !user) return null;

  const list = segment === "saved" ? saved : created;
  const price = (e: EventCard) =>
    e.priceType === "FREE" ? t("common.free") : e.priceType === "DONATION" ? t("common.donation") : `${formatPriceAmount(e.price, e.priceMax)} ${formatCurrency(e.currency)}`;
  const place = (e: EventCard) => [locale === "uk" ? e.city?.nameUk : e.city?.nameEn, price(e)].filter(Boolean).join(" · ");

  const tile = (value: number | string, label: string, Icon: typeof IoEyeOutline) => (
    <div key={label} className="flex flex-1 flex-col items-center gap-0.5 rounded-xl bg-background px-2 py-2 text-center">
      <Icon className="h-3.5 w-3.5 text-muted" aria-hidden="true" />
      <span className="text-[17px] font-extrabold">{value}</span>
      <span className="text-[11px] leading-tight text-muted">{label}</span>
    </div>
  );

  const renderCreated = (item: EventCard) => {
    const a = analytics[item.id];
    const live = item.status !== "DRAFT";
    const external = item.registrationMode === "EXTERNAL";
    const cover = item.media[0];
    return (
      <div key={item.id} className="flex flex-col gap-3 rounded-[18px] bg-surface p-3">
        <Link href={live ? `/events/${item.slug}` : `/organizer/events/${item.id}/edit`} className="flex items-center gap-3">
          {cover ? (
            // eslint-disable-next-line @next/next/no-img-element -- external MinIO URLs
            <img src={cover.thumbnailUrl} alt="" className="h-[72px] w-[72px] shrink-0 rounded-xl object-cover" />
          ) : (
            <span className="h-[72px] w-[72px] shrink-0 rounded-xl bg-background" />
          )}
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="line-clamp-2 text-[15px] font-bold">{item.title}</span>
            <span className={`w-fit rounded-full px-2 py-0.5 text-[11px] font-bold ${item.status === "PUBLISHED" ? "bg-emerald-500/15 text-emerald-600" : "bg-background text-muted"}`}>{t(`myEvents.status.${item.status}`)}</span>
            {item.startsAt && <span className="text-[13px] text-muted">{formatCardDate(item.startsAt, locale, t)}</span>}
            <span className="truncate text-[13px] text-muted">{place(item)}</span>
          </span>
        </Link>

        {live && (
          <>
            <div className="flex gap-2">
              {tile(a?.peopleSeen ?? 0, t("myEvents.stats.seen"), IoEyeOutline)}
              {tile(a?.peopleOpened ?? 0, t("myEvents.stats.opened"), IoHandLeftOutline)}
              {tile(a?.passes ?? 0, t("myEvents.stats.passed"), IoCloseCircleOutline)}
            </div>
            <div className="flex gap-2">
              {tile(a?.saves ?? 0, t("myEvents.stats.saved"), IoHeartOutline)}
              {tile(a?.shares ?? 0, t("myEvents.stats.shared"), IoShareSocialOutline)}
              {external || (a?.ticketClicks ?? 0) > 0
                ? tile(a?.ticketClicks ?? 0, t("myEvents.stats.tickets"), IoTicketOutline)
                : tile(a?.registrations ?? 0, t("myEvents.stats.registered"), IoPeopleOutline)}
            </div>
            {a?.openRatePercent != null && <p className="text-xs text-muted">{t("myEvents.stats.openRate").replace("{percent}", String(a.openRatePercent))}</p>}
          </>
        )}

        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[13px] font-bold text-[var(--accent-from)]">
          {live ? (
            <>
              <Link href={`/organizer/events/${item.id}/stats`}>{t("myEvents.stats.details")}</Link>
              {(item.status === "PUBLISHED" || item.status === "COMPLETED") && <Link href={`/events/${item.slug}/share`}>{t("referral.createStory")}</Link>}
              <Link href={`/organizer/events/${item.id}/edit`}>{t("myEvents.edit")}</Link>
              <button type="button" onClick={() => void deleteDraft(item)} className="font-bold text-danger">
                {t("myEvents.deleteEvent")}
              </button>
            </>
          ) : (
            <>
              <Link href={`/organizer/events/${item.id}/edit`}>{t("myEvents.continueDraft")}</Link>
              <button type="button" onClick={() => void deleteDraft(item)} className="font-bold text-danger">
                {t("myEvents.deleteDraft")}
              </button>
            </>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-6 pb-24 sm:py-10">
      <ScreenHeader title={t("nav.myEvents")} Icon={IoCalendar} />

      <div className="flex gap-2">
        {(["saved", "created"] as const).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setSegment(key)}
            aria-pressed={segment === key}
            className={`rounded-full border px-4 py-2 text-sm font-bold transition ${segment === key ? "accent-gradient border-transparent text-white" : "border-border bg-surface"}`}
          >
            {key === "saved" ? t("myEvents.saved") : t("myEvents.organized")}
          </button>
        ))}
      </div>

      {error && <EmptyState Icon={IoAlertCircleOutline} text={t("common.somethingWentWrong")} />}
      {!error && list === null && <p className="text-center text-muted">{t("common.loading")}</p>}
      {!error && list !== null && list.length === 0 && (
        <EmptyState Icon={segment === "saved" ? IoHeartOutline : IoAddCircleOutline} text={t(segment === "saved" ? "myEvents.empty.saved" : "myEvents.empty.mine")} />
      )}

      {!error && list !== null && list.length > 0 && segment === "created" && (
        <>
          {deleteError && <p role="alert" className="text-sm text-danger">{t("myEvents.deleteEventFailed")}</p>}
          <p className="text-xs text-muted">{t("myEvents.stats.help")}</p>
          <div className="flex flex-col gap-3">{list.map(renderCreated)}</div>
        </>
      )}
      {!error && list !== null && list.length > 0 && segment === "saved" && (
        <div className="flex flex-col gap-2.5">
          {list.map((event) => (
            <EventResultRow key={event.id} event={event} locale={locale} t={t} />
          ))}
        </div>
      )}

      <Link href="/my-registrations" className="flex items-center justify-between rounded-[18px] bg-surface px-4 py-3.5 text-[15px] font-bold">
        {t("myEvents.registrations")}
        <IoChevronForward className="h-[18px] w-[18px] text-muted" aria-hidden="true" />
      </Link>
    </div>
  );
}
