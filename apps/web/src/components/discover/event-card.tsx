"use client";

import {
  CalendarDays,
  MapPin,
  Star,
  UserCheck,
  Users,
  Video,
} from "lucide-react";
import { AttendeeStack } from "./attendee-stack";
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
  const isFree = event.priceType === "FREE";
  const place = [cityName, districtName].filter(Boolean).join(", ");
  const social = event.social;
  const goingLabel = event.capacity
    ? `${social?.registeredCount ?? 0} / ${event.capacity}`
    : String(social?.registeredCount ?? 0);

  return (
    <div className="relative aspect-[3/4] w-full select-none overflow-hidden rounded-3xl bg-surface shadow-xl ring-1 ring-black/5">
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
        <div className="accent-gradient flex h-full w-full items-center justify-center text-white/80">
          <CalendarDays className="h-16 w-16" strokeWidth={1.5} />
        </div>
      )}

      <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-4">
        {categoryName ? (
          <span className="rounded-full bg-black/45 px-3 py-1 text-xs font-semibold text-white backdrop-blur">
            {categoryName}
          </span>
        ) : (
          <span />
        )}
        <span
          className={`rounded-full px-3 py-1 text-xs font-bold backdrop-blur ${
            isFree
              ? "bg-emerald-500/90 text-white"
              : "bg-white/90 text-neutral-900"
          }`}
        >
          {isFree
            ? t("common.free")
            : `${event.price ?? "?"} ${event.currency}`}
        </span>
      </div>

      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/55 to-transparent p-5 pt-24 text-white">
        <h2 className="text-2xl font-bold leading-tight">{event.title}</h2>
        <div className="mt-3 flex flex-col gap-1.5 text-sm text-white/90">
          {event.startsAt && (
            <span className="flex items-center gap-2">
              <CalendarDays
                className="h-4 w-4 shrink-0 text-white/70"
                aria-hidden="true"
              />
              {formatCardDate(event.startsAt, locale, t)}
            </span>
          )}
          {event.format === "OFFLINE" && place && (
            <span className="flex items-center gap-2">
              <MapPin
                className="h-4 w-4 shrink-0 text-white/70"
                aria-hidden="true"
              />
              {place}
            </span>
          )}
          {event.format === "ONLINE" && (
            <span className="flex items-center gap-2">
              <Video
                className="h-4 w-4 shrink-0 text-white/70"
                aria-hidden="true"
              />
              {t("events.wizard.formatOnline")}
            </span>
          )}
        </div>

        {event.description && (
          <p className="mt-2 line-clamp-2 text-sm text-white/75">
            {event.description}
          </p>
        )}

        {social && (
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
            <span className="flex items-center gap-2 font-semibold">
              <Users className="h-4 w-4 text-white/70" aria-hidden="true" />
              {goingLabel}{" "}
              <span className="font-normal text-white/70">
                {t("discover.participants")}
              </span>
            </span>
            <AttendeeStack
              people={social.attendeePreviews}
              total={social.registeredCount}
            />
            {social.friendsGoingCount > 0 && (
              <span className="flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-0.5 text-xs font-semibold">
                <UserCheck className="h-3.5 w-3.5" aria-hidden="true" />
                {social.friendsGoingCount} {t("discover.going")}
              </span>
            )}
            {social.organizerRating.average !== null && (
              <span className="flex items-center gap-1 text-xs font-semibold text-amber-300">
                <Star className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
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
    hour: "2-digit",
    minute: "2-digit",
  });
  if (isSameDay) return `${t("discover.today")} · ${time}`;
  if (isTomorrow) return `${t("discover.tomorrow")} · ${time}`;
  const day = date.toLocaleDateString(tag, {
    weekday: "short",
    day: "numeric",
    month: "long",
  });
  return `${day} · ${time}`;
}
