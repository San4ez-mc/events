"use client";

import { useEffect } from "react";
import { detectSource, track } from "@/lib/analytics";
import { captureEvent } from "@/lib/product-analytics";

/** Records one VIEW per page load (with its traffic source) for published events. */
export function EventViewTracker({
  eventId,
  published,
}: {
  eventId: string;
  published: boolean;
}) {
  useEffect(() => {
    if (!published) return;
    track(eventId, "VIEW", detectSource());
    // The admin funnel (views -> registration started -> registered) reads PostHog, not our own view counter.
    captureEvent("event_view", { event_id: eventId });
    // Lets other components react to "this visitor has now looked at N events" (e.g. the iOS install hint).
    window.dispatchEvent(new Event("kiro:event-viewed"));
  }, [eventId, published]);
  return null;
}
