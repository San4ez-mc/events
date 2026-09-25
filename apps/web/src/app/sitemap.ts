import type { MetadataRoute } from "next";

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://kiro.fineko.space";
const PAGE_SIZE = 50;
const MAX_PAGES = 10;

interface FeedPage {
  items: { slug: string; updatedAt?: string; startsAt?: string }[];
  nextCursor: string | null;
}

/** §63 — public events only (the discovery feed never returns link-only/private ones). Refreshed hourly. */
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = process.env.API_URL ?? "http://localhost:3100";
  const entries: MetadataRoute.Sitemap = [
    { url: SITE, changeFrequency: "hourly", priority: 1 },
    { url: `${SITE}/search`, changeFrequency: "daily", priority: 0.7 },
  ];

  let cursor: string | null = null;
  for (let page = 0; page < MAX_PAGES; page++) {
    const qs = new URLSearchParams({ limit: String(PAGE_SIZE) });
    if (cursor) qs.set("cursor", cursor);
    try {
      const res = await fetch(`${base}/api/v1/discovery?${qs}`, {
        next: { revalidate },
      });
      if (!res.ok) break;
      const body = (await res.json()) as FeedPage;
      for (const e of body.items) {
        entries.push({
          url: `${SITE}/events/${e.slug}`,
          lastModified: e.updatedAt ?? e.startsAt,
          changeFrequency: "daily",
          priority: 0.8,
        });
      }
      cursor = body.nextCursor;
      if (!cursor) break;
    } catch {
      break;
    }
  }
  return entries;
}
