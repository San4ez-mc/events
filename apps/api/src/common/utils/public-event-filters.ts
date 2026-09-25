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
        : { OR: [{ priceType: "FREE" }, { price: range }] },
    );
  }

  if (query.capacityMin != null || query.capacityMax != null) {
    const range: Prisma.IntNullableFilter = {};
    if (query.capacityMin != null) range.gte = query.capacityMin;
    if (query.capacityMax != null) range.lte = query.capacityMax;
    // Unlimited events (capacity null) count as "large" — they fit open-ended ranges only.
    and.push(query.capacityMax == null ? { OR: [{ capacity: range }, { capacity: null }] } : { capacity: range });
  }

  return {
    AND: and,
    status: "PUBLISHED",
    visibility: "PUBLIC",
    cityId: query.cityIds?.length ? { in: query.cityIds } : undefined,
    districtId: query.districtIds?.length ? { in: query.districtIds } : undefined,
    categoryId: query.categoryIds?.length ? { in: query.categoryIds } : undefined,
    format: query.format,
    priceType: query.freeOnly ? "FREE" : undefined,
    ageRestriction: query.adultsOnly ? { gte: 18 } : undefined,
    startsAt: {
      gte: query.dateFrom ? new Date(query.dateFrom) : now,
      lte: query.dateTo ? new Date(query.dateTo) : undefined,
    },
  };
}
