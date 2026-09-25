import Link from "next/link";
import { CalendarDays, MapPin, Star, Tag, Users, Video } from "lucide-react";
import type { SupportedLocale } from "@kiro/i18n";
import { getT } from "@/lib/i18n-server";
import type { EventDetail } from "@/lib/event-types";
import { RegistrationWidget } from "@/components/registration/registration-widget";
import { FollowButton } from "@/components/social/follow-button";
import { ReviewsSection } from "@/components/reviews/reviews-section";
import { AttendeeStack } from "@/components/discover/attendee-stack";
import { EventGallery } from "@/components/event-gallery";
import { EventLocation } from "@/components/event-location";
import { EventChat } from "@/components/event-chat";
import { EventViewTracker } from "@/components/event-view-tracker";
import { EventActions } from "@/components/event-actions";

/**
 * Shared presentational component for the public event page — used by both
 * the server-rendered page (published events, real visitors) and the
 * client-rendered draft-preview fallback (organizer previewing before
 * publishing). Order follows spec §67: gallery, title, date/location/price,
 * social proof, description, organizer, location, rules, participants,
 * reviews, registration.
 */
export function EventPage({
  event,
  locale,
}: {
  event: EventDetail;
  locale: SupportedLocale;
}) {
  const t = getT(locale);
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
  const social = event.social;
  const organizer = event.organizer;
  const spotsLeft =
    event.capacity != null && social
      ? Math.max(0, event.capacity - social.registeredCount)
      : null;
  const meta = "flex items-center gap-2";

  return (
    <article className="mx-auto max-w-2xl px-4 pb-24 pt-6">
      {event.status !== "PUBLISHED" && event.status !== "COMPLETED" && (
        <div className="mb-4 rounded-md border border-[var(--accent-from)] bg-surface px-4 py-2 text-sm">
          {locale === "uk"
            ? "Це попередній перегляд — подія ще не опублікована."
            : "This is a preview — the event isn't published yet."}
        </div>
      )}

      <EventViewTracker
        eventId={event.id}
        published={event.status === "PUBLISHED"}
      />
      <EventGallery media={event.media} />

      <h1 className="mb-3 text-3xl font-bold leading-tight">{event.title}</h1>

      <div className="mb-4 flex flex-col gap-1.5 text-sm text-muted">
        {event.startsAt && (
          <span className={meta}>
            <CalendarDays className="h-4 w-4 shrink-0" aria-hidden="true" />
            {formatDateTime(event.startsAt, locale)}
          </span>
        )}
        {event.format === "OFFLINE" && (cityName || districtName) && (
          <span className={meta}>
            <MapPin className="h-4 w-4 shrink-0" aria-hidden="true" />
            {[cityName, districtName].filter(Boolean).join(", ")}
          </span>
        )}
        {event.format === "ONLINE" && (
          <span className={meta}>
            <Video className="h-4 w-4 shrink-0" aria-hidden="true" />
            {t("events.wizard.formatOnline")}
          </span>
        )}
        <span className={meta}>
          <Tag className="h-4 w-4 shrink-0" aria-hidden="true" />
          <strong className="text-foreground">
            {event.priceType === "FREE"
              ? t("common.free")
              : `${event.price ?? "?"} ${event.currency}`}
          </strong>
          {categoryName && <span>· {categoryName}</span>}
        </span>
      </div>

      {social && (
        <div className="mb-5 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl bg-surface p-4 text-sm">
          <span className={`${meta} font-semibold`}>
            <Users className="h-4 w-4" aria-hidden="true" />
            {event.capacity != null
              ? `${social.registeredCount} / ${event.capacity}`
              : social.registeredCount}{" "}
            <span className="font-normal text-muted">
              {t("events.page.participantsCount")}
            </span>
          </span>
          <span className="[&_span]:border-background">
            <AttendeeStack
              people={social.attendeePreviews}
              total={social.registeredCount}
            />
          </span>
          {spotsLeft !== null && (
            <span
              className={
                spotsLeft === 0 ? "font-semibold text-danger" : "text-muted"
              }
            >
              {spotsLeft === 0
                ? t("events.page.soldOut")
                : `${spotsLeft} ${t("events.page.spotsLeft")}`}
            </span>
          )}
          {event.friendsGoing.count > 0 && (
            <span className="text-muted">
              👥 {event.friendsGoing.count}{" "}
              {event.friendsGoing.count === 1
                ? t("profile.friendsGoingOne")
                : t("profile.friendsGoingMany")}
            </span>
          )}
        </div>
      )}

      <div className="mb-6 flex flex-col gap-3">
        {event.status === "PUBLISHED" && (
          <EventActions
            eventId={event.id}
            slug={event.slug}
            title={event.title}
          />
        )}
        <FollowButton eventId={event.id} />
      </div>

      {event.description && (
        <section className="mb-8 whitespace-pre-wrap text-sm leading-relaxed">
          {event.description}
        </section>
      )}

      {organizer && (
        <section className="mb-8">
          <h2 className="mb-2 text-sm font-semibold">
            {t("events.page.organizer")}
          </h2>
          <div className="flex items-center gap-3 rounded-2xl border border-border p-4">
            {organizer.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- external avatar URLs
              <img
                src={organizer.avatarUrl}
                alt=""
                className="h-12 w-12 rounded-full object-cover"
              />
            ) : (
              <span className="accent-gradient flex h-12 w-12 items-center justify-center rounded-full text-lg font-bold text-white">
                {(organizer.name ?? organizer.nickname ?? "?")
                  .slice(0, 1)
                  .toUpperCase()}
              </span>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">
                {organizer.name ?? organizer.nickname}
              </p>
              <p className="flex flex-wrap items-center gap-x-3 text-xs text-muted">
                {organizer.rating.average !== null && (
                  <span className="flex items-center gap-1 font-semibold text-amber-500">
                    <Star
                      className="h-3.5 w-3.5 fill-current"
                      aria-hidden="true"
                    />
                    {organizer.rating.average.toFixed(1)}
                  </span>
                )}
                <span>
                  {organizer.eventsCount} {t("events.page.eventsHosted")}
                </span>
              </p>
            </div>
            <Link
              href={`/users/${organizer.id}`}
              className="rounded-full border border-border px-3 py-1.5 text-xs font-semibold hover:bg-surface"
            >
              {t("events.page.viewProfile")}
            </Link>
          </div>
        </section>
      )}

      <EventLocation event={event} />

      {event.rules && (
        <section className="mb-8">
          <h2 className="mb-2 text-sm font-semibold">
            {locale === "uk" ? "Правила" : "Rules"}
          </h2>
          <p className="whitespace-pre-wrap text-sm text-muted">
            {event.rules}
          </p>
        </section>
      )}

      {event.participants && event.participants.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 text-sm font-semibold">
            {t("events.page.participants")} ·{" "}
            {social?.registeredCount ?? event.participants.length}
          </h2>
          <ul className="flex flex-wrap gap-3">
            {event.participants.map((p) => (
              <li
                key={p.id}
                className="flex w-16 flex-col items-center gap-1 text-center"
              >
                <Link
                  href={`/users/${p.id}`}
                  className="flex flex-col items-center gap-1"
                >
                  {p.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- external avatar URLs
                    <img
                      src={p.avatarUrl}
                      alt=""
                      className="h-12 w-12 rounded-full object-cover"
                    />
                  ) : (
                    <span className="accent-gradient flex h-12 w-12 items-center justify-center rounded-full font-bold text-white">
                      {(p.name ?? "?").slice(0, 1).toUpperCase()}
                    </span>
                  )}
                  <span className="w-full truncate text-[11px] text-muted">
                    {p.name}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <EventChat eventId={event.id} />

      <ReviewsSection
        eventId={event.id}
        eventStatus={event.status}
        reviewSummary={event.reviewSummary}
      />

      <RegistrationWidget event={event} />

      {event.priceType === "PAID" && (
        <p className="mt-4 rounded-xl bg-surface p-3 text-xs leading-relaxed text-muted">
          {t("events.page.paidDisclaimer")}
        </p>
      )}
    </article>
  );
}

function formatDateTime(iso: string, locale: SupportedLocale): string {
  return new Date(iso).toLocaleString(locale === "uk" ? "uk-UA" : "en-US", {
    weekday: "short",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });
}
