"use client";

import type { SupportedLocale } from "@kiro/i18n";
import type { EventCard as EventCardData } from "@/lib/event-types";

/**
 * The single Tinder-style card (UX §3): cover photo, title, date, district,
 * category, price. Registered-count/attendee-avatars/organizer-rating are
 * part of the spec's card too, but need registration/review data that
 * doesn't exist until Phase 4/8 — omitted here rather than faked.
 */
export function EventCard({
  event,
  locale,
  t,
}: {
  event: EventCardData;
  locale: SupportedLocale;
  t: (key: string) => string;
}) {
  const cover = event.media[0];
  const categoryName = event.category ? (locale === "uk" ? event.category.nameUk : event.category.nameEn) : null;
  const cityName = event.city ? (locale === "uk" ? event.city.nameUk : event.city.nameEn) : null;
  const districtName = event.district?.nameUk ?? null;

  return (
    <div className="relative aspect-[3/4] w-full overflow-hidden rounded-2xl bg-surface shadow-lg">
      {cover ? (
        // eslint-disable-next-line @next/next/no-img-element -- external MinIO URLs
        <img
          src={cover.displayUrl}
          alt=""
          className="h-full w-full object-cover"
          style={
            cover.focalX
              ? { objectPosition: `${Number(cover.focalX) * 100}% ${Number(cover.focalY) * 100}%` }
              : undefined
          }
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-muted">{t("common.empty")}</div>
      )}

      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent p-5 pt-16 text-white">
        <h2 className="text-xl font-bold">{event.title}</h2>
        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-sm opacity-90">
          {event.startsAt && <span>{formatCardDate(event.startsAt, locale, t)}</span>}
          {event.format === "OFFLINE" && (cityName || districtName) && (
            <span>{[cityName, districtName].filter(Boolean).join(", ")}</span>
          )}
          {event.format === "ONLINE" && <span>{t("events.wizard.formatOnline")}</span>}
          <span>{event.priceType === "FREE" ? t("common.free") : `${event.price ?? "?"} ${event.currency}`}</span>
        </div>
        {categoryName && (
          <span className="mt-2 inline-block rounded-full bg-white/15 px-2.5 py-0.5 text-xs font-medium">
            {categoryName}
          </span>
        )}
      </div>
    </div>
  );
}

function formatCardDate(iso: string, locale: SupportedLocale, t: (key: string) => string): string {
  const date = new Date(iso);
  const now = new Date();
  const isSameDay = date.toDateString() === now.toDateString();
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  const isTomorrow = date.toDateString() === tomorrow.toDateString();

  const time = date.toLocaleTimeString(locale === "uk" ? "uk-UA" : "en-US", { hour: "2-digit", minute: "2-digit" });
  if (isSameDay) return `${t("discover.today")} · ${time}`;
  if (isTomorrow) return `${t("discover.tomorrow")} · ${time}`;
  return date.toLocaleString(locale === "uk" ? "uk-UA" : "en-US", { dateStyle: "medium", timeStyle: "short" });
}
