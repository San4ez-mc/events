"use client";

import Link from "next/link";
import type { SupportedLocale } from "@kiro/i18n";
import type { EventCard } from "@/lib/event-types";

/** UX §9 — search is a plain list, not the swipe card. */
export function EventResultRow({
  event,
  locale,
  t,
}: {
  event: EventCard;
  locale: SupportedLocale;
  t: (key: string) => string;
}) {
  const cover = event.media[0];
  const categoryName = event.category ? (locale === "uk" ? event.category.nameUk : event.category.nameEn) : null;
  const cityName = event.city ? (locale === "uk" ? event.city.nameUk : event.city.nameEn) : null;

  return (
    <Link
      href={`/events/${event.slug}`}
      className="flex gap-3 rounded-lg border border-border p-3 hover:bg-surface"
    >
      <div className="h-16 w-16 shrink-0 overflow-hidden rounded-md bg-surface">
        {cover && (
          // eslint-disable-next-line @next/next/no-img-element -- external MinIO URLs
          <img src={cover.thumbnailUrl} alt="" className="h-full w-full object-cover" />
        )}
      </div>
      <div className="flex min-w-0 flex-col justify-center gap-0.5">
        <span className="truncate font-semibold">{event.title}</span>
        <span className="truncate text-xs text-muted">
          {[
            event.startsAt ? new Date(event.startsAt).toLocaleDateString(locale === "uk" ? "uk-UA" : "en-US") : null,
            cityName,
            categoryName,
          ]
            .filter(Boolean)
            .join(" · ")}
        </span>
        <span className="text-xs">
          {event.priceType === "FREE" ? t("common.free") : `${event.price ?? "?"} ${event.currency}`}
        </span>
      </div>
    </Link>
  );
}
