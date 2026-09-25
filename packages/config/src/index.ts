/**
 * Non-secret constants shared across apps. Anything that a non-developer
 * might reasonably want to tune (prices, ranking weights, reminder timing)
 * belongs in the DB (`system_settings` / `credit_packages`) per §95 & §50,
 * not here — this file is for structural constants that require a deploy to
 * change either way (API shape, hard technical limits).
 */

export const API_PREFIX = "/api/v1";

/** §22 — hard cap on event media, enforced server-side regardless of config. */
export const MAX_EVENT_MEDIA_FILES = 10;

/** §88 — initial defaults; overridable via system_settings without a deploy. */
export const DEFAULT_MEDIA_LIMITS = {
  imageMaxBytes: 15 * 1024 * 1024,
  videoMaxBytes: 200 * 1024 * 1024,
  allowedImageMimeTypes: ["image/jpeg", "image/png", "image/webp"] as const,
  allowedVideoMimeTypes: ["video/mp4", "video/quicktime"] as const,
};

/** §57 — default/max page size for cursor-paginated list endpoints. */
export const PAGINATION = {
  defaultLimit: 20,
  maxLimit: 50,
};

/** §16 — categories are at most 2 levels deep (parent -> child). */
export const MAX_CATEGORY_DEPTH = 2;

/** §59 — passed events resurface after this many days by default. */
export const DEFAULT_FEED_PASS_COOLDOWN_DAYS = 30;

/** §58 — deterministic discovery ranking weights (rule-based, no ML). */
export const DISCOVERY_RANKING_WEIGHTS = {
  preferredCity: 100,
  preferredDistrict: 60,
  preferredCategory: 50,
  dateProximityMax: 20,
  freshEventMax: 15,
  popularEventMax: 15,
  availabilityBonus: 5,
  friendsGoingPerFriend: 12,
  friendsGoingMax: 36,
  budgetFit: 8,
};
