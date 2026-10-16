import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { fetchPublicEventBySlug } from "@/lib/server-api";
import { resolveLocale, LOCALE_COOKIE } from "@/lib/locale";
import { EventPage } from "@/components/event-page";
import { DraftPreview } from "./draft-preview";

/**
 * §62 — server-rendered metadata for public events (title/description/
 * canonical/OpenGraph/dates/location). Private/unpublished events get
 * `noindex` and don't need real metadata since search engines never see them.
 */
export async function generateMetadata({ params }: PageProps<"/events/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const event = await fetchPublicEventBySlug(slug);

  if (!event) {
    return { title: "Кіро", robots: { index: false, follow: false } };
  }

  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "https://kiro.fineko.space";
  const when = event.startsAt
    ? new Date(event.startsAt).toLocaleString("uk-UA", { timeZone: "Europe/Kyiv", weekday: "short", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })
    : null;
  const where = event.format === "ONLINE" ? "Онлайн" : event.city?.nameUk;
  const price = event.priceType === "FREE" ? "Безкоштовно" : event.priceType === "PAID" && event.price ? `від ${Number(event.price)} грн` : null;
  // Date, place and price first: that is what decides a click from a link preview.
  const lead = [when, where, price].filter(Boolean).join(" · ");
  const description = [lead, event.description?.replace(/\s+/g, " ").slice(0, 160)].filter(Boolean).join(". ") || undefined;
  const image = event.media[0] ? `${site}/api/v1/events/${event.id}/share-image?variant=1&format=post` : undefined;

  return {
    title: `${event.title} — Кіро`,
    description,
    alternates: { canonical: `/events/${event.slug}` },
    robots: event.visibility === "PUBLIC" ? { index: true, follow: true } : { index: false, follow: false },
    openGraph: {
      title: event.title,
      description,
      type: "website",
      images: image ? [{ url: image, width: 1080, height: 1350 }] : undefined,
    },
    twitter: { card: "summary_large_image", title: event.title, description, images: image ? [image] : undefined },
  };
}

export default async function EventSlugPage({ params, searchParams }: PageProps<"/events/[slug]">) {
  const { slug } = await params;
  const { preview } = await searchParams;
  const event = await fetchPublicEventBySlug(slug);

  if (event) {
    const cookieStore = await cookies();
    const locale = resolveLocale(cookieStore.get(LOCALE_COOKIE)?.value);
    return (
      <>
        <EventStructuredData event={event} />
        <EventPage event={event} locale={locale} />
      </>
    );
  }

  // Not public via the unauthenticated server fetch. Only an explicit owner/admin preview link (?preview=1)
  // may retry client-side with a token; everything else is a real 404 so crawlers never index soft-404s.
  if (preview !== "1") notFound();
  return <DraftPreview slug={slug} />;
}

function EventStructuredData({
  event,
}: {
  event: NonNullable<Awaited<ReturnType<typeof fetchPublicEventBySlug>>>;
}) {
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "Event",
    name: event.title,
    startDate: event.startsAt ?? undefined,
    endDate: event.endsAt ?? undefined,
    eventAttendanceMode:
      event.format === "ONLINE"
        ? "https://schema.org/OnlineEventAttendanceMode"
        : "https://schema.org/OfflineEventAttendanceMode",
    location:
      event.format === "OFFLINE"
        ? { "@type": "Place", name: event.city?.nameUk, address: event.addressText ?? undefined }
        : { "@type": "VirtualLocation", url: event.onlineUrl ?? undefined },
    image: event.media[0]?.displayUrl,
    description: event.description ?? undefined,
    offers: {
      "@type": "Offer",
      price: event.priceType !== "PAID" ? "0" : (event.price ?? undefined),
      priceCurrency: event.currency,
    },
  };

  // JSON-LD structured data — not user-controlled HTML, safe to inject directly.
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }} />;
}
