"use client";

import Link from "next/link";
import { IoCalendarOutline, IoLocationOutline } from "react-icons/io5";
import type { SupportedLocale } from "@kiro/i18n";
import type { EventCard } from "@/lib/event-types";
import { EVENT_TZ, formatCurrency, formatPriceAmount } from "@/lib/format";

/** UX §9 — search is a plain list, not the swipe card. Card style matches the app's list rows. */
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
  const when = event.startsAt
    ? new Date(event.startsAt).toLocaleString(locale === "uk" ? "uk-UA" : "en-GB", { timeZone: EVENT_TZ, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
    : null;
  const price =
    event.priceType === "FREE"
      ? t("common.free")
      : event.priceType === "DONATION"
        ? t("common.donation")
        : `${formatPriceAmount(event.price, event.priceMax)} ${formatCurrency(event.currency)}`;

  return (
    <Link
      href={`/events/${event.slug}?src=search`}
      className="flex gap-3.5 rounded-[14px] border border-border bg-surface p-3 transition hover:border-[var(--accent-from)]/50"
    >
      <div className="h-[88px] w-[66px] shrink-0 overflow-hidden rounded-[10px] bg-background">
        {cover && (
          // eslint-disable-next-line @next/next/no-img-element -- external MinIO URLs
          <img src={cover.thumbnailUrl} alt="" className="h-full w-full object-cover" />
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col justify-center gap-1">
        <span className="line-clamp-2 text-[15px] font-semibold leading-snug">{event.title}</span>
        {when && (
          <span className="flex items-center gap-1.5 text-xs text-muted">
            <IoCalendarOutline className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {when}
          </span>
        )}
        {(cityName || categoryName) && (
          <span className="flex items-center gap-1.5 truncate text-xs text-muted">
            <IoLocationOutline className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {[cityName, categoryName].filter(Boolean).join(" · ")}
          </span>
        )}
      </div>
      <span className="self-center whitespace-nowrap rounded-full bg-[var(--accent-from)]/10 px-3 py-1 text-xs font-bold text-[var(--accent-from)]">{price}</span>
    </Link>
  );
}
