import type { FriendshipStatus } from "@kiro/types";
import type { EventCard } from "./event-types";

export type RelationshipStatus =
  | "SELF"
  | "FRIENDS"
  | "PENDING_SENT"
  | "PENDING_RECEIVED"
  | "BLOCKED_BY_ME"
  | "BLOCKED_ME"
  | "NONE";

export interface PublicUser {
  id: string;
  name: string | null;
  nickname: string | null;
  avatarUrl: string | null;
}

export interface PublicProfile {
  id: string;
  name: string | null;
  nickname: string | null;
  avatarUrl: string | null;
  bio: string | null;
  memberSince: string;
  /** Perk of the PRO organizer subscription tier. */
  isVerifiedOrganizer: boolean;
  /** Only present if the owner opted in via "show my age" — otherwise always null. */
  age: number | null;
  socialLinks: { type: string; url: string }[];
  friendCount: number;
  eventsCreatedCount: number;
  upcomingEvents: EventCard[];
  /** Phase 8 (§30/§38) — organizer's own completed events + their live aggregate rating. */
  pastEvents: EventCard[];
  ratingAverage: number | null;
  reviewsCount: number;
  relationshipStatus: RelationshipStatus;
  /** True when the owner made their profile friends-only and the viewer isn't a friend — every field above except id/name/nickname/avatarUrl/memberSince/isVerifiedOrganizer is a stub. */
  friendsOnly: boolean;
}

export interface FriendRequest {
  id: string;
  status: FriendshipStatus;
  createdAt: string;
  requester?: PublicUser;
  addressee?: PublicUser;
}

export interface FriendsGoing {
  count: number;
  previews: PublicUser[];
}
