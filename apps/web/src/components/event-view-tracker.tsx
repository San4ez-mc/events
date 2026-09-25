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
    if (published) track(eventId, "VIEW", detectSource());
  }, [eventId, published]);
  return null;
}
