import type { SupportedLocale } from "@kiro/i18n";
import { getT } from "@/lib/i18n-server";
import type { EventDetail } from "@/lib/event-types";
import { RegistrationWidget } from "@/components/registration/registration-widget";

/**
 * Shared presentational component for the public event page — used by both
 * the server-rendered page (published events, real visitors) and the
 * client-rendered draft-preview fallback (organizer previewing before
 * publishing). Order follows UX doc §10: gallery, title, date/location/price,
 * description, organizer, location, rules, CTA.
 */
export function EventPage({ event, locale }: { event: EventDetail; locale: SupportedLocale }) {
  const t = getT(locale);
  const categoryName = event.category ? (locale === "uk" ? event.category.nameUk : event.category.nameEn) : null;
  const cityName = event.city ? (locale === "uk" ? event.city.nameUk : event.city.nameEn) : null;
  const districtName = event.district?.nameUk ?? null;
  const cover = event.media[0];

  return (
    <article className="mx-auto max-w-2xl px-4 pb-24 pt-6">
      {event.status !== "PUBLISHED" && (
        <div className="mb-4 rounded-md border border-[var(--accent-from)] bg-surface px-4 py-2 text-sm">
          {locale === "uk" ? "Це попередній перегляд — подія ще не опублікована." : "This is a preview — the event isn't published yet."}
        </div>
      )}

      {event.media.length > 0 ? (
        <div className="mb-6 aspect-[3/4] w-full overflow-hidden rounded-xl bg-surface">
          {/* eslint-disable-next-line @next/next/no-img-element -- external MinIO URLs */}
          <img
            src={cover!.displayUrl}
            alt=""
            className="h-full w-full object-cover"
            style={
              cover!.focalX
                ? { objectPosition: `${Number(cover!.focalX) * 100}% ${Number(cover!.focalY) * 100}%` }
                : undefined
            }
          />
        </div>
      ) : (
        <div className="mb-6 flex aspect-[3/4] w-full items-center justify-center rounded-xl bg-surface text-muted">
          {t("common.empty")}
        </div>
      )}

      <h1 className="mb-2 text-2xl font-bold">{event.title}</h1>

      <div className="mb-4 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
        {event.startsAt && <span>{formatDateTime(event.startsAt, locale)}</span>}
        {event.format === "OFFLINE" && (cityName || districtName) && (
          <span>{[cityName, districtName].filter(Boolean).join(", ")}</span>
        )}
        {event.format === "ONLINE" && <span>{t("events.wizard.formatOnline")}</span>}
        <span>
          {event.priceType === "FREE"
            ? t("common.free")
            : `${event.price ?? "?"} ${event.currency}`}
        </span>
        {categoryName && <span>{categoryName}</span>}
      </div>

      {event.description && (
        <section className="mb-8 whitespace-pre-wrap text-sm leading-relaxed">{event.description}</section>
      )}

      {event.format === "OFFLINE" && event.addressText && (
        <section className="mb-8">
          <h2 className="mb-2 text-sm font-semibold">{t("events.wizard.addressText")}</h2>
          <p className="text-sm text-muted">{event.addressText}</p>
        </section>
      )}

      {event.rules && (
        <section className="mb-8">
          <h2 className="mb-2 text-sm font-semibold">
            {locale === "uk" ? "Правила" : "Rules"}
          </h2>
          <p className="whitespace-pre-wrap text-sm text-muted">{event.rules}</p>
        </section>
      )}

      <RegistrationWidget event={event} />
    </article>
  );
}

function formatDateTime(iso: string, locale: SupportedLocale): string {
  return new Date(iso).toLocaleString(locale === "uk" ? "uk-UA" : "en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}
