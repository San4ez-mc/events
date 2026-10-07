import Link from "next/link";
import { IoCalendarOutline, IoLocationOutline, IoPeople, IoPricetagOutline, IoStar, IoVideocamOutline } from "react-icons/io5";
import type { SupportedLocale } from "@kiro/i18n";
import { getT } from "@/lib/i18n-server";
import type { EventDetail } from "@/lib/event-types";
import { formatCurrency, formatPriceAmount } from "@/lib/format";
import { RegistrationWidget } from "@/components/registration/registration-widget";
import { FollowButton } from "@/components/social/follow-button";
import { ReviewsSection } from "@/components/reviews/reviews-section";
import { AttendeeStack } from "@/components/discover/attendee-stack";
import { EventGallery } from "@/components/event-gallery";
import { EventLocation } from "@/components/event-location";
import { EventChat } from "@/components/event-chat";
import { EventViewTracker } from "@/components/event-view-tracker";
import { EventActions } from "@/components/event-actions";
import { EventCtaBar } from "@/components/event-cta-bar";

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
  const row = "flex items-center gap-3 rounded-[14px] border border-border bg-surface px-3.5 py-3 text-[15px]";
  const badge = "flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--accent-from)]/10 text-[var(--accent-from)]";
  const priceLabel =
    event.priceType === "FREE"
      ? t("common.free")
      : event.priceType === "DONATION"
        ? t("common.donation")
        : `${formatPriceAmount(event.price, event.priceMax)} ${formatCurrency(event.currency)}`;
  const ctaLabel =
    event.registrationMode === "EXTERNAL"
      ? event.priceType === "PAID"
        ? t("registration.externalBuy")
        : t("registration.externalRegister")
      : event.approvalMode === "ORGANIZER_APPROVAL"
        ? t("registration.apply")
        : t("registration.register");

  return (
    <article className="mx-auto max-w-5xl pb-36 sm:px-4 sm:pt-6 lg:pb-12">
      {event.status !== "PUBLISHED" && event.status !== "COMPLETED" && (
        <div className="mx-4 mb-4 mt-4 rounded-[10px] border border-[var(--accent-from)] bg-surface px-4 py-2 text-sm sm:mx-0 sm:mt-0">
          {t("events.page.previewBanner")}
        </div>
      )}
      {event.isTest && (
        <div className="mx-4 mb-4 mt-4 flex items-center gap-2 rounded-[10px] border border-red-500 bg-red-500/10 px-4 py-2 text-sm text-red-600 sm:mx-0 sm:mt-0">
          <span className="rounded-full bg-red-500 px-2 py-0.5 text-xs font-bold text-white">
            {t("events.testBadge")}
          </span>
          {t("events.testEventNotice")}
        </div>
      )}

      <EventViewTracker
        eventId={event.id}
        published={event.status === "PUBLISHED"}
      />
      <div className="lg:grid lg:grid-cols-[minmax(0,440px)_minmax(0,1fr)] lg:items-start lg:gap-10">
        <div className="lg:sticky lg:top-20">
          <EventGallery media={event.media} />
      {youtubeEmbedId(event.youtubeUrl) && (
        <div className="mt-4 aspect-video w-full overflow-hidden sm:rounded-[20px]">
          <iframe
            src={`https://www.youtube.com/embed/${youtubeEmbedId(event.youtubeUrl)}`}
            title="YouTube"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            className="h-full w-full"
          />
        </div>
      )}

        </div>

        <div className="flex min-w-0 flex-col px-4 pt-5 sm:px-0 lg:pt-0">
      <h1 className="text-[28px] font-extrabold leading-tight sm:text-[32px]">{event.title}</h1>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        {event.status === "PUBLISHED" && (
          <EventActions eventId={event.id} slug={event.slug} title={event.title} startsAt={event.startsAt} canGo={event.registrationMode === "EXTERNAL"} />
        )}
        <FollowButton eventId={event.id} />
      </div>

      <ul className="mt-5 flex flex-col gap-3">
        {event.startsAt && (
          <li className={row}>
            <span className={badge}>
              <IoCalendarOutline className="h-5 w-5" aria-hidden="true" />
            </span>
            <span className="min-w-0">
              <span className="block font-semibold">{formatDateTime(event.startsAt, locale, event.timezone)}</span>
              <a href={`/api/v1/events/${event.id}/calendar.ics`} download className="text-xs text-[var(--accent-from)] hover:underline">
                {t("events.actions.addToCalendar")}
              </a>
            </span>
          </li>
        )}
        {event.format === "OFFLINE" && (cityName || districtName) && (
          <li className={row}>
            <span className={badge}>
              <IoLocationOutline className="h-5 w-5" aria-hidden="true" />
            </span>
            <span className="font-semibold">{[cityName, districtName].filter(Boolean).join(", ")}</span>
          </li>
        )}
        {event.format === "ONLINE" && (
          <li className={row}>
            <span className={badge}>
              <IoVideocamOutline className="h-5 w-5" aria-hidden="true" />
            </span>
            <span className="font-semibold">{t("events.wizard.formatOnline")}</span>
          </li>
        )}
        <li className={row}>
          <span className={badge}>
            <IoPricetagOutline className="h-5 w-5" aria-hidden="true" />
          </span>
          <span className="min-w-0">
            <span className="block font-semibold">{priceLabel}</span>
            {categoryName && <span className="text-xs text-muted">{categoryName}</span>}
          </span>
        </li>
      </ul>
      {event.additionalCategories.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {event.additionalCategories.map(({ category }) => (
            <span key={category.id} className="rounded-full border border-border bg-surface px-3 py-1 text-xs">
              {locale === "uk" ? category.nameUk : category.nameEn}
            </span>
          ))}
        </div>
      )}

      {social && (
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-[14px] border border-border bg-surface p-4 text-sm">
          <span className="flex items-center gap-2 font-semibold">
            <IoPeople className="h-[18px] w-[18px]" aria-hidden="true" />
            {event.registrationMode === "EXTERNAL"
              ? social.registeredCount > 0
                ? social.registeredCount
                : "∞"
              : event.capacity != null
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

      <div id="register" className="order-last mt-8 scroll-mt-24 lg:order-none lg:mt-6">
        <RegistrationWidget event={event} />

        {/* Donation events: entry is free and needs no registration step to give, so the link is always available. */}
        {event.priceType === "DONATION" && event.paymentUrl && (
          <a
            href={event.paymentUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 block rounded-md border border-border px-4 py-2 text-center text-sm font-medium hover:bg-surface"
          >
            {t("registration.donate")}
          </a>
        )}

        {event.priceType === "PAID" && (
          <p className="mt-4 rounded-xl bg-surface p-3 text-xs leading-relaxed text-muted">
            {t("events.page.paidDisclaimer")}
          </p>
        )}
      </div>

      {event.description && (
        <section className="mb-8 mt-8 whitespace-pre-wrap text-[15px] leading-relaxed">
          {event.description}
        </section>
      )}

      {organizer && (
        <section className="mb-8">
          <h2 className="mb-2 text-lg font-bold">
            {t("events.page.organizer")}
          </h2>
          <div className="flex items-center gap-3 rounded-[14px] border border-border bg-surface p-4">
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
                    <IoStar className="h-3.5 w-3.5" aria-hidden="true" />
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
          <h2 className="mb-2 text-lg font-bold">
            {t("events.page.rules")}
          </h2>
          <p className="whitespace-pre-wrap text-sm text-muted">
            {event.rules}
          </p>
        </section>
      )}

      {event.priceOptions && event.priceOptions.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-2 text-lg font-bold">
            {t("registration.ticketType")}
          </h2>
          <ul className="flex flex-col gap-2">
            {event.priceOptions.map((tier) => (
              <li
                key={tier.id}
                className="flex items-center justify-between rounded-[14px] border border-border bg-surface px-4 py-3 text-sm"
              >
                <span>
                  {tier.name}
                  {tier.soldOut && (
                    <span className="ml-2 text-xs text-danger">
                      {t("events.page.soldOut")}
                    </span>
                  )}
                </span>
                <strong>
                  {Number(tier.price) === 0
                    ? t("common.free")
                    : `${Number(tier.price)} ${formatCurrency(event.currency)}`}
                </strong>
              </li>
            ))}
          </ul>
        </section>
      )}

      {event.faqItems && event.faqItems.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-2 text-lg font-bold">{t("events.page.faq")}</h2>
          <div className="flex flex-col gap-2">
            {event.faqItems.map((item) => (
              <details
                key={item.id}
                className="rounded-[14px] border border-border bg-surface px-4 py-3 text-sm"
              >
                <summary className="cursor-pointer font-medium">
                  {item.question}
                </summary>
                <p className="mt-2 whitespace-pre-wrap text-muted">
                  {item.answer}
                </p>
              </details>
            ))}
          </div>
        </section>
      )}

      {event.participants && event.participants.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 text-lg font-bold">
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

        </div>
      </div>

      {event.status === "PUBLISHED" && (
        <EventCtaBar
          eventId={event.id}
          priceLabel={priceLabel}
          label={ctaLabel}
          externalUrl={event.registrationMode === "EXTERNAL" ? (event.externalRegistrationUrl ?? null) : null}
        />
      )}
    </article>
  );
}

/** Pulls the video id out of any common YouTube URL shape (watch?v=, youtu.be/, /embed/, /shorts/). */
function youtubeEmbedId(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{11})/.exec(url);
  return m?.[1] ?? null;
}

/** Shown in the event's own time zone: this runs on the server (UTC), so without it a 18:00 Kyiv event read 15:00. */
function formatDateTime(iso: string, locale: SupportedLocale, timeZone = "Europe/Kyiv"): string {
  return new Date(iso).toLocaleString(locale === "uk" ? "uk-UA" : "en-US", {
    timeZone,
    weekday: "short",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });
}
