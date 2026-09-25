import type { UserRole, UserStatus } from "@kiro/types";
import type { CursorPage, EventSummary } from "./event-types";

export interface AdminUserSummary {
  id: string;
  email: string;
  name: string | null;
  nickname: string | null;
  avatarUrl: string | null;
  role: UserRole;
  status: UserStatus;
  createdAt: string;
  organizerActivatedAt: string | null;
}

export interface AdminUserDetail extends AdminUserSummary {
  lastLoginAt: string | null;
  eventsCount: number;
  registrationsCount: number;
}

export interface AdminEventListItem extends EventSummary {
  owner: { id: string; name: string | null; nickname: string | null; email: string };
}

export interface ModerationCase {
  id: string;
  targetType: string;
  targetId: string;
  reasonCode: string;
  details: string | null;
  status: "PENDING" | "APPROVED" | "REJECTED";
  createdAt: string;
}

export interface Report {
  id: string;
  reporterId: string;
  targetType: "EVENT" | "USER" | "REVIEW";
  targetId: string;
  reason: string;
  description: string | null;
  status: "OPEN" | "IN_REVIEW" | "RESOLVED" | "DISMISSED";
  createdAt: string;
  reporter: { id: string; name: string | null; nickname: string | null; email: string };
}

export interface AuditLogEntry {
  id: string;
  actorUserId: string | null;
  action: string;
  entityType: string;
  entityId: string;
  beforeJson: unknown;
  afterJson: unknown;
  createdAt: string;
  actor: { id: string; name: string | null; nickname: string | null; email: string } | null;
}

export interface AdminAnalyticsSummary {
  funnel30d: { impressions: number; views: number; shares: number; saves: number; registrations: number };
  topEvents30d: { id: string; title: string; slug: string | null; views: number; registrations: number }[];
  totalUsers: number;
  totalOrganizers: number;
  eventsByStatus: Record<string, number>;
  totalRegistrations: number;
  totalRevenue: string;
  openReports: number;
  pendingModeration: number;
}

export type { CursorPage };
