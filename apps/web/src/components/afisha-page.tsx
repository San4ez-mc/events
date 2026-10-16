import Link from "next/link";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import type { SupportedLocale } from "@kiro/i18n";
import { LOCALE_COOKIE, resolveLocale } from "@/lib/locale";
import { getT } from "@/lib/i18n-server";
import { AFISHA_FILTERS, dateWindow, type AfishaFilter } from "@/lib/afisha";
import { EVENT_TZ, formatCurrency, formatPriceAmount } from "@/lib/format";
import { fetchCategoriesFlat, fetchCities, fetchPublicEvents, type PublicCategory, type PublicCity } from "@/lib/server-api";
import type { EventCard } from "@/lib/event-types";

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://kiro.fineko.space";
/** Category landing pages worth linking from every city page (slugs from the categories table). */
const FEATURED_CATEGORY_SLUGS = ["concerts", "standup", "parties", "culture", "cinema", "sport"];

interface Resolved {
  city: PublicCity;
  filter: AfishaFilter | null;
  category: PublicCategory | null;
  events: EventCard[];
  categories: PublicCategory[];
  locale: SupportedLocale;
  t: (key: string) => string;
}

async function resolve(citySlug: string, filterSlug: string | null): Promise<Resolved> {
  const locale = resolveLocale((await cookies()).get(LOCALE_COOKIE)?.value);
  const t = getT(locale);
  const [cities, categories] = await Promise.all([fetchCities(), fetchCategoriesFlat()]);
  const city = cities.find((c) => c.slug === citySlug);
  if (!city) notFound();

  const filter = (AFISHA_FILTERS as readonly string[]).includes(filterSlug ?? "") ? (filterSlug as AfishaFilter) : null;
  const category = !filter && filterSlug ? (categories.find((c) => c.slug === filterSlug) ?? null) : null;
  if (filterSlug && !filter && !category) notFound();

  const params: Record<string, string> = { cityIds: city.id, limit: "30" };
  const window = dateWindow(filter);
  if (window) Object.assign(params, window);
  if (filter === "free") params.freeOnly = "true";
  if (category) params.categoryIds = category.id;
  const events = await fetchPublicEvents(params);
  return { city, filter, category, events, categories, locale, t };
}

const name = (x: { nameUk: string; nameEn: string }, locale: SupportedLocale) => (locale === "uk" ? x.nameUk : x.nameEn);

function heading(r: Resolved): string {
  const city = name(r.city, r.locale);
  if (r.category) return r.t("afisha.headingCategory").replace("{city}", city).replace("{category}", name(r.category, r.locale));
  return r.t(`afisha.heading.${r.filter ?? "all"}`).replace("{city}", city);
}

export async function afishaMetadata(citySlug: string, filterSlug: string | null): Promise<Metadata> {
  const r = await resolve(citySlug, filterSlug);
  const title = `${heading(r)} | Кіро`;
  const titles = r.events.slice(0, 3).map((e) => e.title).join(", ");
  const description = r.events.length > 0 ? r.t("afisha.metaDescription").replace("{count}", String(r.events.length)).replace("{titles}", titles) : r.t("afisha.intro");
  const path = `/afisha/${r.city.slug}${filterSlug ? `/${filterSlug}` : ""}`;
  return {
    title,
    description,
    alternates: { canonical: path },
    // A page with nothing on it is thin content: keep it out of search results until it has events.
    robots: r.events.length > 0 ? { index: true, follow: true } : { index: false, follow: true },
    openGraph: { title, description, type: "website", url: path, images: r.events[0]?.media[0] ? [{ url: r.events[0].media[0].displayUrl }] : undefined },
  };
}

export async function AfishaPage({ citySlug, filterSlug }: { citySlug: string; filterSlug: string | null }) {
  const r = await resolve(citySlug, filterSlug);
  const { t, locale } = r;
  const base = `/afisha/${r.city.slug}`;
  const chip = (href: string, label: string, on: boolean) => (
    <Link key={href} href={href} className={`shrink-0 rounded-full border px-3.5 py-1.5 text-[13px] font-semibold ${on ? "accent-gradient border-transparent text-white" : "border-border bg-surface"}`}>
      {label}
    </Link>
  );
  const featured = FEATURED_CATEGORY_SLUGS.map((slug) => r.categories.find((c) => c.slug === slug)).filter((c): c is PublicCategory => Boolean(c));

  const itemList = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    itemListElement: r.events.map((e, i) => ({ "@type": "ListItem", position: i + 1, url: `${SITE}/events/${e.slug}`, name: e.title })),
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 pb-28">
      <h1 className="text-[26px] font-extrabold leading-tight sm:text-3xl">{heading(r)}</h1>
      <p className="mt-2 text-sm text-muted">{t("afisha.intro")}</p>

      <nav aria-label={t("afisha.filters")} className="mt-5 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {chip(base, t("afisha.all"), !r.filter && !r.category)}
        {AFISHA_FILTERS.map((f) => chip(`${base}/${f}`, t(`afisha.${f}`), r.filter === f))}
        {featured.map((c) => chip(`${base}/${c.slug}`, name(c, locale), r.category?.id === c.id))}
      </nav>

      {r.events.length === 0 ? (
        <div className="mt-8 rounded-[14px] border border-border bg-surface p-6 text-center">
          <p className="text-muted">{t("afisha.empty")}</p>
          <Link href="/organizer/events/new" className="accent-gradient mt-4 inline-flex min-h-11 items-center rounded-full px-5 text-[15px] font-semibold text-white">
            {t("nav.create")}
          </Link>
        </div>
      ) : (
        <ul className="mt-5 flex flex-col gap-2.5">
          {r.events.map((event) => (
            <li key={event.id}>
              <AfishaRow event={event} locale={locale} t={t} />
            </li>
          ))}
        </ul>
      )}

      <div className="mt-8 flex flex-wrap items-center gap-3">
        <Link href="/" className="accent-gradient inline-flex min-h-11 items-center rounded-full px-5 text-[15px] font-semibold text-white">
          {t("afisha.openSwipe")}
        </Link>
        <Link href="/search" className="inline-flex min-h-11 items-center rounded-full border border-border px-5 text-[15px] font-semibold">
          {t("nav.search")}
        </Link>
      </div>

      {r.events.length > 0 && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(itemList) }} />}
    </div>
  );
}

/** Server-rendered result row (the interactive one is a client component that needs a `t` function prop). */
function AfishaRow({ event, locale, t }: { event: EventCard; locale: SupportedLocale; t: (key: string) => string }) {
  const cover = event.media[0];
  const when = event.startsAt
    ? new Date(event.startsAt).toLocaleString(locale === "uk" ? "uk-UA" : "en-GB", { timeZone: EVENT_TZ, weekday: "short", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })
    : null;
  const place = event.format === "ONLINE" ? t("events.wizard.formatOnline") : event.city ? name(event.city, locale) : null;
  const price = event.priceType === "FREE" ? t("common.free") : event.priceType === "DONATION" ? t("common.donation") : `${formatPriceAmount(event.price, event.priceMax)} ${formatCurrency(event.currency)}`;
  return (
    <Link href={`/events/${event.slug}`} className="flex gap-3.5 rounded-[14px] border border-border bg-surface p-3 transition hover:border-[var(--accent-from)]/50">
      <div className="h-[88px] w-[66px] shrink-0 overflow-hidden rounded-[10px] bg-background">
        {cover && (
          // eslint-disable-next-line @next/next/no-img-element -- external MinIO URLs
          <img src={cover.thumbnailUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col justify-center gap-1">
        <span className="line-clamp-2 text-[15px] font-semibold leading-snug">{event.title}</span>
        {when && <span className="text-xs text-muted">{when}</span>}
        {place && <span className="truncate text-xs text-muted">{place}</span>}
      </div>
      <span className="self-center whitespace-nowrap rounded-full bg-[var(--accent-from)]/10 px-3 py-1 text-xs font-bold text-[var(--accent-from)]">{price}</span>
    </Link>
  );
}
