import type {
  ApprovalMode,
  EventFormat,
  EventPriceType,
  EventStatus,
  EventVisibility,
} from "@kiro/types";

/**
 * Mirrors what EventsController actually returns (Prisma's inferred shape).
 * TODO(tech debt): the API's Swagger responses are currently untyped
 * (controllers return raw Prisma results, not response DTO classes, so
 * openapi-typescript can't infer them — see packages/api-client/src/schema.d.ts,
 * `content?: never` on every Events/Category endpoint). §8 wants one typed
 * source of truth instead of hand-duplicated interfaces like this one;
 * revisit once the API layer has explicit @ApiOkResponse DTOs.
 */
export interface EventMedia {
  id: string;
  type: "IMAGE" | "VIDEO";
  originalUrl: string;
  displayUrl: string;
  thumbnailUrl: string;
  width: number | null;
  height: number | null;
  sortOrder: number;
  focalX: string | null;
  focalY: string | null;
}

export interface EventSummary {
  id: string;
  ownerId: string;
  slug: string;
  title: string;
  status: EventStatus;
  visibility: EventVisibility;
  format: EventFormat;
  startsAt: string | null;
  endsAt: string | null;
  cityId: string | null;
  districtId: string | null;
  categoryId: string | null;
  priceType: EventPriceType;
  price: string | null;
  currency: string;
  createdAt: string;
  media: EventMedia[];
}

export interface EventDetail extends EventSummary {
  description: string | null;
  language: string;
  timezone: string;
  addressText: string | null;
  onlineUrl: string | null;
  capacity: number | null;
  minParticipants: number | null;
  registrationDeadline: string | null;
  approvalMode: ApprovalMode;
  ageRestriction: number | null;
  rules: string | null;
  paymentUrl: string | null;
  category: { id: string; nameUk: string; nameEn: string } | null;
  city: { id: string; nameUk: string; nameEn: string } | null;
  district: { id: string; nameUk: string } | null;
}

export interface CursorPage<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

/** Shape returned by GET /discovery, GET /search, GET /discovery/saved (Phase 3). */
export interface EventCard extends EventSummary {
  category: { id: string; nameUk: string; nameEn: string } | null;
  city: { id: string; nameUk: string; nameEn: string } | null;
  district: { id: string; nameUk: string } | null;
}
