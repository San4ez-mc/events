/** One event as read from an outside ticketing/listing site, before it is matched to our cities and categories. */
export interface ExternalEvent {
  source: string;
  /** Stable id on the source site (slug or URL path): the idempotency key with `source`. */
  sourceRef: string;
  /** The event's own page: becomes the "register / buy" button. */
  url: string;
  title: string;
  description: string;
  startsAt: Date;
  endsAt: Date | null;
  /** False when the page gave a date but no time, so the start time is our default and the description says so. */
  timeKnown: boolean;
  venue: string | null;
  address: string | null;
  /** City name as the source writes it, or null when it doesn't say. */
  city: string | null;
  priceMin: number | null;
  priceMax: number | null;
  imageUrl: string | null;
  /** Category slug (see `categories.slug`). */
  categorySlug: string;
  ageRestriction: number;
  organizerName: string | null;
}

export type ParseResult = { event: ExternalEvent } | { skip: string };
