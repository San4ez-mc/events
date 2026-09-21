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

  const description = event.description?.slice(0, 200) ?? undefined;
  const image = event.media[0]?.displayUrl;

  return {
    title: `${event.title} — Кіро`,
    description,
    alternates: { canonical: `/events/${event.slug}` },
    robots: event.visibility === "PUBLIC" ? { index: true, follow: true } : { index: false, follow: false },
    openGraph: {
      title: event.title,
      description,
      type: "website",
      images: image ? [{ url: image }] : undefined,
    },
  };
}

export default async function EventSlugPage({ params }: PageProps<"/events/[slug]">) {
  const { slug } = await params;
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

  // Not found (or not public) via the unauthenticated server fetch — could
  // still be the owner's own unpublished draft; let the client retry with
  // their access token rather than immediately rendering a hard 404.
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
      price: event.priceType === "FREE" ? "0" : (event.price ?? undefined),
      priceCurrency: event.currency,
    },
  };

  // JSON-LD structured data — not user-controlled HTML, safe to inject directly.
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }} />;
}
