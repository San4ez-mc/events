import type { Prisma } from "@prisma/client";
import type { EventFormat } from "@kiro/types";

/** Filter fields shared by the discovery feed (§57) and search (§56) query DTOs. */
export interface PublicEventFilterParams {
  cityIds?: string[];
  districtIds?: string[];
  categoryIds?: string[];
  format?: EventFormat;
  freeOnly?: boolean;
  minBudget?: number;
  maxBudget?: number;
  /** §7 "Вік: 18+" — only events restricted to adults. */
  adultsOnly?: boolean;
  /** §7 "Кількість людей" — bounds on the event capacity (null capacity = unlimited, matches open-ended ranges). */
  capacityMin?: number;
  capacityMax?: number;
  dateFrom?: string;
  dateTo?: string;
  /** Set by controllers for old app builds that can't handle externally-registered events. */
  hideExternal?: boolean;
  /** Set by controllers for everyone except old app builds: made-up demo events (isTest) are not shown to them. */
  hideTest?: boolean;
}

/** Only ever surfaces published, public events — never drafts or private events — to anonymous/public callers. */
export function buildPublicEventWhere(query: PublicEventFilterParams, now: Date): Prisma.EventWhereInput {
  const and: Prisma.EventWhereInput[] = [];

  // A price bound must not hide free events (their price is null): free always fits "up to X".
  if (query.minBudget != null || query.maxBudget != null) {
    const range: Prisma.DecimalFilter = {};
    if (query.minBudget != null) range.gte = query.minBudget;
    if (query.maxBudget != null) range.lte = query.maxBudget;
    and.push(
      query.minBudget != null && query.minBudget > 0
        ? { priceType: "PAID", price: range }
        : { OR: [{ priceType: { in: ["FREE", "DONATION"] } }, { price: range }] },
    );
  }

  if (query.capacityMin != null || query.capacityMax != null) {
    const range: Prisma.IntNullableFilter = {};
    if (query.capacityMin != null) range.gte = query.capacityMin;
    if (query.capacityMax != null) range.lte = query.capacityMax;
    // Unlimited events (capacity null) count as "large" — they fit open-ended ranges only.
    and.push(query.capacityMax == null ? { OR: [{ capacity: range }, { capacity: null }] } : { capacity: range });
  }

  // UX §10 — an event can have additional (non-primary) categories; a category filter matches either.
  if (query.categoryIds?.length) {
    and.push({
      OR: [{ categoryId: { in: query.categoryIds } }, { additionalCategories: { some: { categoryId: { in: query.categoryIds } } } }],
    });
  }

  if (!query.dateFrom) {
    // Still "on" today: not yet started, still running (multi-day shows/exhibitions), or started earlier today with no
    // end time — an event must not vanish from the feed at its start minute.
    and.push({ OR: [{ startsAt: { gte: now } }, { endsAt: { gte: now } }, { endsAt: null, startsAt: { gte: startOfKyivDay(now) } }] });
    if (query.dateTo) and.push({ startsAt: { lte: new Date(query.dateTo) } });
  }

  return {
    AND: and,
    status: "PUBLISHED",
    visibility: "PUBLIC",
    registrationMode: query.hideExternal ? "INTERNAL" : undefined,
    isTest: query.hideTest ? false : undefined,
    cityId: query.cityIds?.length ? { in: query.cityIds } : undefined,
    districtId: query.districtIds?.length ? { in: query.districtIds } : undefined,
    format: query.format,
    priceType: query.freeOnly ? { in: ["FREE", "DONATION"] } : undefined,
    ageRestriction: query.adultsOnly ? { gte: 18 } : undefined,
    ...(query.dateFrom ? { startsAt: { gte: new Date(query.dateFrom), lte: query.dateTo ? new Date(query.dateTo) : undefined } } : {}),
  };
}

/** 00:00 of the current day in Kyiv (UTC+2 / UTC+3 in summer) as an instant. */
function startOfKyivDay(now: Date): Date {
  const kyiv = new Date(now.toLocaleString("en-US", { timeZone: "Europe/Kyiv" }));
  const offsetMs = kyiv.getTime() - new Date(now.toLocaleString("en-US", { timeZone: "UTC" })).getTime();
  kyiv.setHours(0, 0, 0, 0);
  return new Date(kyiv.getTime() - offsetMs);
}
