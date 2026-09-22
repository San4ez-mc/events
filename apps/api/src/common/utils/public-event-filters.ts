import type { Prisma } from "@prisma/client";
import type { EventFormat } from "@kiro/types";

/** Filter fields shared by the discovery feed (§57) and search (§56) query DTOs. */
export interface PublicEventFilterParams {
  cityIds?: string[];
  districtIds?: string[];
  categoryIds?: string[];
  format?: EventFormat;
  freeOnly?: boolean;
  maxBudget?: number;
  dateFrom?: string;
  dateTo?: string;
}

/** Only ever surfaces published, public events — never drafts or private events — to anonymous/public callers. */
export function buildPublicEventWhere(query: PublicEventFilterParams, now: Date): Prisma.EventWhereInput {
  return {
    status: "PUBLISHED",
    visibility: "PUBLIC",
    cityId: query.cityIds?.length ? { in: query.cityIds } : undefined,
    districtId: query.districtIds?.length ? { in: query.districtIds } : undefined,
    categoryId: query.categoryIds?.length ? { in: query.categoryIds } : undefined,
    format: query.format,
    priceType: query.freeOnly ? "FREE" : undefined,
    price: query.maxBudget != null ? { lte: query.maxBudget } : undefined,
    startsAt: {
      gte: query.dateFrom ? new Date(query.dateFrom) : now,
      lte: query.dateTo ? new Date(query.dateTo) : undefined,
    },
  };
}
