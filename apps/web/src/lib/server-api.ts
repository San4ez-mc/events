import "server-only";
import type { EventCard, EventDetail } from "./event-types";

/**
 * Server-only fetch, straight to the API process — not through the
 * next.config.ts rewrite (that exists for the browser; this runs on the
 * Next.js server itself, so there's no cookie/CORS reason to hop through
 * the rewrite here).
 */
function apiUrl(path: string): string {
  const base = process.env.API_URL ?? "http://localhost:3100";
  return `${base}${path}`;
}

/** Unauthenticated — only ever returns PUBLISHED events (§39/§63). Null if not found/not public. */
export async function fetchPublicEventBySlug(slug: string): Promise<EventDetail | null> {
  const res = await fetch(apiUrl(`/api/v1/events/slug/${encodeURIComponent(slug)}`), {
    cache: "no-store",
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Failed to fetch event: ${res.status}`);
  return (await res.json()) as EventDetail;
}

export interface PublicCity {
  id: string;
  slug: string;
  nameUk: string;
  nameEn: string;
}

export interface PublicCategory {
  id: string;
  slug: string;
  nameUk: string;
  nameEn: string;
  children?: PublicCategory[];
}

/** Cities (cached for an hour: they almost never change). */
export async function fetchCities(): Promise<PublicCity[]> {
  const res = await fetch(apiUrl("/api/v1/geography/cities"), { next: { revalidate: 3600 } });
  return res.ok ? ((await res.json()) as PublicCity[]) : [];
}

/** Categories flattened (parents and children), for resolving a slug in a URL. */
export async function fetchCategoriesFlat(): Promise<PublicCategory[]> {
  const res = await fetch(apiUrl("/api/v1/categories"), { next: { revalidate: 3600 } });
  if (!res.ok) return [];
  const tree = (await res.json()) as PublicCategory[];
  return tree.flatMap((c) => [c, ...(c.children ?? [])]);
}

/** The public feed with plain query params (the same ones the browser feed uses); anonymous, so never personalised. */
export async function fetchPublicEvents(params: Record<string, string>): Promise<EventCard[]> {
  const qs = new URLSearchParams(params);
  const res = await fetch(apiUrl(`/api/v1/discovery?${qs}`), { next: { revalidate: 600 } });
  if (!res.ok) return [];
  return ((await res.json()) as { items: EventCard[] }).items;
}

/**
 * Cities that currently have at least one upcoming public event — the ones worth a landing page or a footer link.
 * One cached call: the footer renders on every page, and asking the API once per city from the Next server used to trip
 * the API's own rate limit (the server counts as a single caller), which silently dropped cities from the list.
 */
export async function fetchCitiesWithEvents(): Promise<PublicCity[]> {
  const res = await fetch(apiUrl("/api/v1/geography/cities/with-events"), { next: { revalidate: 600 } });
  return res.ok ? ((await res.json()) as PublicCity[]) : [];
}
