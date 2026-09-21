import "server-only";
import type { EventDetail } from "./event-types";

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
