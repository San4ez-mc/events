import type { EventFormat, EventPriceType, EventStatus } from "@kiro/types";

export interface EventMedia {
  id: string;
  type: "IMAGE" | "VIDEO";
  displayUrl: string;
  thumbnailUrl: string;
  focalX: string | null;
  focalY: string | null;
}

export interface EventCard {
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
  friendsGoing: { count: number; previews: { id: string; name: string | null; avatarUrl: string | null }[] };
  ownerId: string;
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
