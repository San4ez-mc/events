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
  socialLinks: { type: string; url: string }[];
  friendCount: number;
  eventsCreatedCount: number;
  upcomingEvents: EventCard[];
  relationshipStatus: RelationshipStatus;
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
