"use client";

import { IoCalendar, IoCalendarOutline, IoLocationOutline, IoPeople, IoPeopleCircle, IoStar, IoVideocamOutline } from "react-icons/io5";
import { AttendeeStack } from "./attendee-stack";
import type { SupportedLocale } from "@kiro/i18n";
import type { EventCard as EventCardData } from "@/lib/event-types";
import { EVENT_TZ, formatCurrency, formatPriceAmount } from "@/lib/format";

/**
 * The swipe card — laid out like the app's: a full-bleed cover with the chips (category, price), a big title,
 * date, place, a short description and who is going stacked at the bottom. `bottomInset` lifts that text above the
 * action buttons the feed floats over the card's lower edge.
 */
export function EventCard({
  event,
  locale,
  t,
  bottomInset = 0,
}: {
  event: EventCardData;
  locale: SupportedLocale;
  t: (key: string) => string;
  bottomInset?: number;
}) {
  const cover = event.media[0];
  const categoryName = event.category
    ? locale === "uk"
      ? event.category.nameUk
      : event.category.nameEn
    : null;
  const cityName = event.city
    ? locale === "uk"
      ? event.city.nameUk
      : event.city.nameEn
    : null;
  const districtName = event.district?.nameUk ?? null;
  const isFree = event.priceType !== "PAID";
  const place = [cityName, districtName].filter(Boolean).join(", ");
  const social = event.social;
  const goingLabel =
    event.registrationMode === "EXTERNAL"
      ? (social?.registeredCount ?? 0) > 0
        ? String(social?.registeredCount)
        : "∞"
      : event.capacity
        ? `${social?.registeredCount ?? 0} / ${event.capacity}`
        : String(social?.registeredCount ?? 0);

  return (
    <div className="relative h-full w-full select-none overflow-hidden bg-surface sm:rounded-[28px] sm:shadow-xl sm:ring-1 sm:ring-black/5">
      {cover ? (
        // eslint-disable-next-line @next/next/no-img-element -- external MinIO URLs
        <img
          src={cover.displayUrl}
          alt=""
          draggable={false}
          className="h-full w-full object-cover"
          style={
            cover.focalX
              ? {
                  objectPosition: `${Number(cover.focalX) * 100}% ${Number(cover.focalY) * 100}%`,
                }
              : undefined
          }
        />
      ) : (
        // No photo: the app's placeholder — two soft colour blobs and a calendar badge.
        <div className="relative flex h-full w-full items-center justify-center overflow-hidden bg-background">
          <span className="absolute -left-28 -top-24 h-80 w-80 rounded-full bg-[var(--accent-from)] opacity-50" />
          <span className="absolute -bottom-28 -right-24 h-80 w-80 rounded-full bg-[var(--accent-to)] opacity-50" />
          <span className="relative flex h-24 w-24 items-center justify-center rounded-full bg-white/15 text-white">
            <IoCalendar className="h-11 w-11" aria-hidden="true" />
          </span>
        </div>
      )}

      <div className="pointer-events-none absolute inset-x-0 top-0 h-36 bg-gradient-to-b from-black/45 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/80 via-black/55 to-transparent" />

      <div className="absolute inset-x-0 bottom-0 px-4 text-white" style={{ paddingBottom: 16 + bottomInset }}>
        <div className="mb-2 flex flex-wrap items-center gap-2">
          {event.isTest && (
            <span className="rounded-full bg-red-500/90 px-3 py-1 text-xs font-bold text-white">
              {t("events.testBadge")}
            </span>
          )}
          {categoryName && (
            <span className="rounded-full bg-white/20 px-3 py-1 text-xs font-bold text-white backdrop-blur">
              {categoryName}
            </span>
          )}
          <span
            className={`rounded-full px-3 py-1 text-xs font-bold ${
              isFree ? "bg-emerald-500/90 text-white" : "bg-white/90 text-neutral-900"
            }`}
          >
            {isFree
              ? event.priceType === "DONATION"
                ? t("common.donation")
                : t("common.free")
              : `${formatPriceAmount(event.price, event.priceMax)} ${formatCurrency(event.currency)}`}
          </span>
        </div>

        <h2 className="line-clamp-3 text-[26px] font-extrabold leading-[1.15] sm:text-[28px]">{event.title}</h2>
        <div className="mt-2 flex flex-col gap-1.5 text-[15px] text-white/90">
          {event.startsAt && (
            <span className="flex items-center gap-2">
              <IoCalendarOutline className="h-4 w-4 shrink-0 text-white/75" aria-hidden="true" />
              {formatCardDate(event.startsAt, locale, t)}
            </span>
          )}
          {event.format === "OFFLINE" && place && (
            <span className="flex items-center gap-2">
              <IoLocationOutline className="h-4 w-4 shrink-0 text-white/75" aria-hidden="true" />
              {place}
            </span>
          )}
          {event.format === "ONLINE" && (
            <span className="flex items-center gap-2">
              <IoVideocamOutline className="h-4 w-4 shrink-0 text-white/75" aria-hidden="true" />
              {t("events.wizard.formatOnline")}
            </span>
          )}
        </div>

        {event.description && (
          <p className="mt-1.5 line-clamp-2 text-sm text-white/75">{event.description}</p>
        )}

        {social && (
          <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
            <span className="flex items-center gap-1.5 font-bold">
              <IoPeople className="h-4 w-4 text-white/80" aria-hidden="true" />
              {goingLabel}{" "}
              <span className="font-normal text-white/70">{t("discover.participants")}</span>
            </span>
            <AttendeeStack people={social.attendeePreviews} total={social.registeredCount} />
            {social.friendsGoingCount > 0 && (
              <span className="flex items-center gap-1 rounded-full bg-white/20 px-2.5 py-0.5 text-xs font-bold">
                <IoPeopleCircle className="h-3.5 w-3.5" aria-hidden="true" />
                {social.friendsGoingCount} {t("discover.going")}
              </span>
            )}
            {social.organizerRating.average !== null && (
              <span className="flex items-center gap-1 text-[13px] font-bold text-amber-300">
                <IoStar className="h-3.5 w-3.5" aria-hidden="true" />
                {social.organizerRating.average.toFixed(1)}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function formatCardDate(
  iso: string,
  locale: SupportedLocale,
  t: (key: string) => string,
): string {
  const date = new Date(iso);
  const now = new Date();
  const isSameDay = date.toDateString() === now.toDateString();
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  const isTomorrow = date.toDateString() === tomorrow.toDateString();

  const tag = locale === "uk" ? "uk-UA" : "en-US";
  const time = date.toLocaleTimeString(tag, {
    timeZone: EVENT_TZ,
    hour: "2-digit",
    minute: "2-digit",
  });
  if (isSameDay) return `${t("discover.today")} · ${time}`;
  if (isTomorrow) return `${t("discover.tomorrow")} · ${time}`;
  const day = date.toLocaleDateString(tag, {
    timeZone: EVENT_TZ,
    weekday: "short",
    day: "numeric",
    month: "long",
  });
  return `${day} · ${time}`;
}
