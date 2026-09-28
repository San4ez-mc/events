import type { CollaboratorPermission, EventFormat, EventPriceType, EventStatus, RecurrenceType } from "@kiro/types";

export interface EventMedia {
  id: string;
  type: "IMAGE" | "VIDEO";
  originalUrl: string;
  displayUrl: string;
  thumbnailUrl: string;
  focalX: string | null;
  focalY: string | null;
}

export interface SocialProof {
  registeredCount: number;
  attendeePreviews: { id: string; name: string | null; avatarUrl: string | null }[];
  friendsGoingCount: number;
  organizerRating: { average: number | null; reviewsCount: number };
}

export interface EventCard {
  description?: string | null;
  capacity?: number | null;
  social?: SocialProof;
  id: string;
  slug: string;
  title: string;
  status: EventStatus;
  format: EventFormat;
  startsAt: string | null;
  priceType: EventPriceType;
  price: string | null;
  currency: string;
  media: EventMedia[];
  category: { id: string; nameUk: string; nameEn: string } | null;
  city: { id: string; nameUk: string; nameEn: string } | null;
  district: { id: string; nameUk: string } | null;
}

export interface EventDetail extends EventCard {
  addressLocked?: boolean;
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
  addressText: string | null;
  onlineUrl: string | null;
  capacity: number | null;
  registrationDeadline: string | null;
  rules: string | null;
  approvalMode: "AUTO" | "ORGANIZER_APPROVAL";
  paymentUrl: string | null;
  registrationFields: {
    id: string;
    label: string;
    type: string;
    required: boolean;
    optionsJson: string[] | null;
    sortOrder: number;
  }[];
  reviewSummary: { average: number | null; count: number };
  viewerSaved?: boolean;
  priceOptions?: { id: string; name: string; price: string; capacity: number | null; taken: number; soldOut: boolean }[];
  faqItems?: { id: string; question: string; answer: string }[];
  friendsGoing: { count: number; previews: { id: string; name: string | null; avatarUrl: string | null }[] };
  ownerId: string;
  seriesId?: string | null;
  endsAt?: string | null;
}

/** §29 — recurring events: one occurrence is a normal, independent Event row. */
export interface EventSeries {
  id: string;
  ownerId: string;
  recurrenceType: RecurrenceType;
  recurrenceRuleJson: unknown;
  templateEventId: string;
  createdAt: string;
}

export type EventOccurrence = EventCard;

export interface CreateSeriesResult {
  series: EventSeries;
  occurrences: EventOccurrence[];
}

/** §30 — co-organizers with granular per-event permissions. */
export interface Collaborator {
  id: string;
  eventId: string;
  userId: string;
  permissions: CollaboratorPermission[];
  createdAt: string;
  user: { id: string; name: string | null; nickname: string | null; avatarUrl: string | null; email: string };
}

export interface CursorPage<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface Registration {
  id: string;
  eventId: string;
  status:
    | "PENDING"
    | "REGISTERED"
    | "PAYMENT_PENDING"
    | "CONFIRMED"
    | "REJECTED"
    | "CANCELLED"
    | "ATTENDED"
    | "NO_SHOW"
    | "WAITLISTED";
}

export interface RegistrationWithEvent extends Registration {
  event: EventCard;
}
