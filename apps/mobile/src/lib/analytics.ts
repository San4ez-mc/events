/** §45 — fire-and-forget event analytics. Never throws and never blocks the UI. */
import { API_URL } from "./api-client";
import { captureEvent } from "./product-analytics";

export type TrackedAction = "IMPRESSION" | "VIEW" | "SHARE" | "REGISTRATION_STARTED";
export type TrafficSource = "SWIPE" | "SEARCH" | "DIRECT" | "PROFILE" | "THREADS" | "OTHER";

// One id per app launch, so the funnel can be de-duplicated per session without storing anything.
const SESSION_ID = `m-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

export function track(eventId: string, action: TrackedAction, source?: TrafficSource): void {
  // Impressions fire for every swiped card — far too noisy for product analytics; the first-party funnel keeps them.
  if (action !== "IMPRESSION") captureEvent(`event_${action.toLowerCase()}`, { event_id: eventId, source });
  try {
    void fetch(`${API_URL}/api/v1/analytics/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ events: [{ eventId, action, source }], sessionId: SESSION_ID }),
    }).catch(() => {});
  } catch {
    // Analytics must never affect the app.
  }
}

/** Route param `src` set by our own navigation; anything else counts as a direct open. */
export function sourceFromParam(src: string | undefined): TrafficSource {
  const value = src?.toUpperCase();
  return value === "SWIPE" || value === "SEARCH" || value === "PROFILE" ? value : "DIRECT";
}
