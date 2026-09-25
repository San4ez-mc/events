import type {
  ApprovalMode,
  CollaboratorPermission,
  EventFormat,
  EventInvitationStatus,
  EventPriceType,
  EventStatus,
  EventVisibility,
  RecurrenceType,
  RegistrationFieldType,
  RegistrationStatus,
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
  seriesId: string | null;
  media: EventMedia[];
}

export interface RegistrationField {
  id: string;
  eventId: string;
  label: string;
  type: RegistrationFieldType;
  required: boolean;
  optionsJson: string[] | null;
  sortOrder: number;
}

export interface EventDetail extends EventSummary {
  social?: SocialProof;
  addressLocked?: boolean;
  googlePlaceId?: string | null;
  latitude?: string | null;
  longitude?: string | null;
  organizer?: {
    id: string;
    name: string | null;
    nickname: string | null;
    avatarUrl: string | null;
    bio: string | null;
    eventsCount: number;
    rating: { average: number | null; reviewsCount: number };
  };
  participants?: { id: string; name: string | null; avatarUrl: string | null }[];
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
  cancellationReason: string | null;
  category: { id: string; nameUk: string; nameEn: string } | null;
  city: { id: string; nameUk: string; nameEn: string } | null;
  district: { id: string; nameUk: string } | null;
  registrationFields: RegistrationField[];
  friendsGoing: { count: number; previews: { id: string; name: string | null; avatarUrl: string | null }[] };
  reviewSummary: { average: number | null; count: number };
}

/** Phase 8 — post-event reviews (§37). */
export interface EventReview {
  id: string;
  eventId: string;
  authorUserId: string;
  rating: number;
  text: string | null;
  status: "PUBLISHED" | "HIDDEN" | "REMOVED";
  createdAt: string;
  updatedAt: string;
  author: { id: string; name: string | null; nickname: string | null; avatarUrl: string | null };
}

export interface RegistrationAnswer {
  id: string;
  fieldId: string;
  valueJson: unknown;
  field: RegistrationField;
}

export interface Registration {
  id: string;
  eventId: string;
  userId: string;
  status: RegistrationStatus;
  showAsParticipant: boolean;
  registeredAt: string;
  approvedAt: string | null;
  rejectedAt: string | null;
  cancelledAt: string | null;
  paymentClickedAt: string | null;
  paymentConfirmedAt: string | null;
  organizerPrivateNote: string | null;
  answers: RegistrationAnswer[];
}

export interface RegistrationWithEvent extends Registration {
  event: EventCard;
}

export interface OrganizerRegistration extends Registration {
  user: {
    id: string;
    name: string | null;
    nickname: string | null;
    email: string;
    phone: string | null;
    avatarUrl: string | null;
  };
}

export interface CursorPage<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

/** Shape returned by GET /discovery, GET /search, GET /discovery/saved (Phase 3). */

/** UX §3/§83 — counts and opt-in previews attached to every card by the API. */
export interface SocialProof {
  registeredCount: number;
  attendeePreviews: { id: string; name: string | null; avatarUrl: string | null }[];
  friendsGoingCount: number;
  organizerRating: { average: number | null; reviewsCount: number };
}

export interface EventCard extends EventSummary {
  description?: string | null;
  capacity?: number | null;
  social?: SocialProof;
  category: { id: string; nameUk: string; nameEn: string } | null;
  city: { id: string; nameUk: string; nameEn: string } | null;
  district: { id: string; nameUk: string } | null;
}

/** Phase 7 — co-organizers (§30). */
export interface Collaborator {
  id: string;
  eventId: string;
  userId: string;
  permissions: CollaboratorPermission[];
  createdAt: string;
  user: {
    id: string;
    name: string | null;
    nickname: string | null;
    avatarUrl: string | null;
    email: string;
  };
}

/** Phase 7 — GET /events/:id/stats (§35 — organizer analytics). */
export interface EventStats {
  registrations: number;
  confirmed: number;
  cancellations: number;
  paymentClicks: number;
  saves: number;
  impressions?: number;
  views?: number;
  shares?: number;
  viewsBySource?: Record<string, number>;
  conversionViewToRegistration?: number | null;
  daily?: { date: string; impressions: number; views: number; registrations: number }[];
}

/** Phase 7 — recurring events (§29). One occurrence is a normal, independent Event row. */
export interface EventSeries {
  id: string;
  ownerId: string;
  recurrenceType: RecurrenceType;
  recurrenceRuleJson: unknown;
  templateEventId: string;
  createdAt: string;
}

export type EventOccurrence = EventSummary;

export interface CreateSeriesResult {
  series: EventSeries;
  occurrences: EventOccurrence[];
}

/** Phase 7 — invite previous participants of other events (§31). */
export interface InvitationCandidate {
  id: string;
  name: string | null;
  nickname: string | null;
  avatarUrl: string | null;
  email: string;
}

export interface EventInvitation {
  id: string;
  eventId: string;
  inviterUserId: string;
  inviteeUserId: string;
  status: EventInvitationStatus;
  createdAt: string;
  event: { id: string; slug: string; title: string; startsAt: string | null };
}
