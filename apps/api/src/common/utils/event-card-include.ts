import type { Prisma } from "@prisma/client";

/** The relations a discovery/search/saved-events card needs to render (cover photo + names). */
export const EVENT_CARD_INCLUDE = {
  media: { orderBy: { sortOrder: "asc" as const }, take: 1 },
  category: true,
  city: true,
  district: true,
} satisfies Prisma.EventInclude;

export type EventCard = Prisma.EventGetPayload<{ include: typeof EVENT_CARD_INCLUDE }>;
