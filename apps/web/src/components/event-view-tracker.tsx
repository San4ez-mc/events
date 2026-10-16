"use client";

import { useEffect } from "react";
import { detectSource, track } from "@/lib/analytics";

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
    // Lets other components react to "this visitor has now looked at N events" (e.g. the iOS install hint).
    window.dispatchEvent(new Event("kiro:event-viewed"));
  }, [eventId, published]);
  return null;
}
