/**
 * Shared domain enums, mirrored 1:1 with the Prisma schema (apps/api/prisma/schema.prisma).
 * Source of truth: "Technical Specification for AI Coding Agent" + "Продукт і UX Кіро".
 *
 * Kept as plain string-union objects (not TS `enum`) so they serialize identically
 * over JSON/OpenAPI and can be consumed as-is by Prisma's generated string literal types.
 */

export const UserRole = {
  USER: "USER",
  MODERATOR: "MODERATOR",
  ADMIN: "ADMIN",
  SUPER_ADMIN: "SUPER_ADMIN",
} as const;
export type UserRole = (typeof UserRole)[keyof typeof UserRole];

export const UserStatus = {
  ACTIVE: "ACTIVE",
  SUSPENDED: "SUSPENDED",
  BLOCKED: "BLOCKED",
  DELETED: "DELETED",
} as const;
export type UserStatus = (typeof UserStatus)[keyof typeof UserStatus];

export const SocialLinkType = {
  INSTAGRAM: "INSTAGRAM",
  TELEGRAM: "TELEGRAM",
  FACEBOOK: "FACEBOOK",
  TIKTOK: "TIKTOK",
  WEBSITE: "WEBSITE",
  OTHER: "OTHER",
} as const;
export type SocialLinkType = (typeof SocialLinkType)[keyof typeof SocialLinkType];

export const LocationPermissionState = {
  UNKNOWN: "UNKNOWN",
  GRANTED: "GRANTED",
  DENIED: "DENIED",
} as const;
export type LocationPermissionState =
  (typeof LocationPermissionState)[keyof typeof LocationPermissionState];

export const RegionStatus = {
  ACTIVE: "ACTIVE",
  ARCHIVED: "ARCHIVED",
} as const;
export type RegionStatus = (typeof RegionStatus)[keyof typeof RegionStatus];

export const CityStatus = {
  ACTIVE: "ACTIVE",
  ARCHIVED: "ARCHIVED",
} as const;
export type CityStatus = (typeof CityStatus)[keyof typeof CityStatus];

export const DistrictStatus = {
  ACTIVE: "ACTIVE",
  PENDING: "PENDING",
  MERGED: "MERGED",
  ARCHIVED: "ARCHIVED",
} as const;
export type DistrictStatus = (typeof DistrictStatus)[keyof typeof DistrictStatus];

export const GeoSource = {
  SYSTEM: "SYSTEM",
  USER_CREATED: "USER_CREATED",
  ADMIN_CREATED: "ADMIN_CREATED",
} as const;
export type GeoSource = (typeof GeoSource)[keyof typeof GeoSource];

export const CategoryStatus = {
  ACTIVE: "ACTIVE",
  PENDING: "PENDING",
  MERGED: "MERGED",
  HIDDEN: "HIDDEN",
  ARCHIVED: "ARCHIVED",
} as const;
export type CategoryStatus = (typeof CategoryStatus)[keyof typeof CategoryStatus];

export const EventStatus = {
  DRAFT: "DRAFT",
  PENDING_MODERATION: "PENDING_MODERATION",
  PUBLISHED: "PUBLISHED",
  REJECTED: "REJECTED",
  CANCELLED: "CANCELLED",
  COMPLETED: "COMPLETED",
  ARCHIVED: "ARCHIVED",
} as const;
export type EventStatus = (typeof EventStatus)[keyof typeof EventStatus];

export const EventVisibility = {
  PUBLIC: "PUBLIC",
  PRIVATE: "PRIVATE",
} as const;
export type EventVisibility = (typeof EventVisibility)[keyof typeof EventVisibility];

export const EventFormat = {
  OFFLINE: "OFFLINE",
  ONLINE: "ONLINE",
} as const;
export type EventFormat = (typeof EventFormat)[keyof typeof EventFormat];

export const ApprovalMode = {
  AUTO: "AUTO",
  ORGANIZER_APPROVAL: "ORGANIZER_APPROVAL",
} as const;
export type ApprovalMode = (typeof ApprovalMode)[keyof typeof ApprovalMode];

export const EventPriceType = {
  FREE: "FREE",
  PAID: "PAID",
} as const;
export type EventPriceType = (typeof EventPriceType)[keyof typeof EventPriceType];

export const Currency = {
  UAH: "UAH",
} as const;
export type Currency = (typeof Currency)[keyof typeof Currency];

export const EventMediaType = {
  IMAGE: "IMAGE",
  VIDEO: "VIDEO",
} as const;
export type EventMediaType = (typeof EventMediaType)[keyof typeof EventMediaType];

export const MediaModerationStatus = {
  PENDING: "PENDING",
  APPROVED: "APPROVED",
  REJECTED: "REJECTED",
} as const;
export type MediaModerationStatus =
  (typeof MediaModerationStatus)[keyof typeof MediaModerationStatus];

export const RegistrationFieldType = {
  TEXT: "TEXT",
  TEXTAREA: "TEXTAREA",
  NUMBER: "NUMBER",
  PHONE: "PHONE",
  EMAIL: "EMAIL",
  SELECT: "SELECT",
  MULTISELECT: "MULTISELECT",
  CHECKBOX: "CHECKBOX",
  DATE: "DATE",
} as const;
export type RegistrationFieldType =
  (typeof RegistrationFieldType)[keyof typeof RegistrationFieldType];

export const RegistrationStatus = {
  PENDING: "PENDING",
  REGISTERED: "REGISTERED",
  PAYMENT_PENDING: "PAYMENT_PENDING",
  CONFIRMED: "CONFIRMED",
  REJECTED: "REJECTED",
  CANCELLED: "CANCELLED",
  ATTENDED: "ATTENDED",
  NO_SHOW: "NO_SHOW",
  WAITLISTED: "WAITLISTED",
} as const;
export type RegistrationStatus = (typeof RegistrationStatus)[keyof typeof RegistrationStatus];

/** Registration statuses that make a user eligible to leave a review (§81). */
export const REVIEW_ELIGIBLE_REGISTRATION_STATUSES: RegistrationStatus[] = [
  RegistrationStatus.REGISTERED,
  RegistrationStatus.CONFIRMED,
  RegistrationStatus.ATTENDED,
];

export const RecurrenceType = {
  DAILY: "DAILY",
  EVERY_N_DAYS: "EVERY_N_DAYS",
  WEEKLY: "WEEKLY",
  EVERY_N_WEEKS: "EVERY_N_WEEKS",
  SPECIFIC_WEEKDAY: "SPECIFIC_WEEKDAY",
  SPECIFIC_DAY_OF_MONTH: "SPECIFIC_DAY_OF_MONTH",
  EVERY_N_MONTHS: "EVERY_N_MONTHS",
} as const;
export type RecurrenceType = (typeof RecurrenceType)[keyof typeof RecurrenceType];

export const CollaboratorRole = {
  OWNER: "OWNER",
  MANAGER: "MANAGER",
} as const;
export type CollaboratorRole = (typeof CollaboratorRole)[keyof typeof CollaboratorRole];

/** Fine-grained permission scopes a MANAGER co-organizer can be granted (§33). */
export const CollaboratorPermission = {
  EDIT_EVENT: "EDIT_EVENT",
  MANAGE_REGISTRATIONS: "MANAGE_REGISTRATIONS",
  MANAGE_PAYMENTS: "MANAGE_PAYMENTS",
  SEND_NOTIFICATIONS: "SEND_NOTIFICATIONS",
  MANAGE_CHAT: "MANAGE_CHAT",
  INVITE_PREVIOUS_PARTICIPANTS: "INVITE_PREVIOUS_PARTICIPANTS",
  VIEW_ANALYTICS: "VIEW_ANALYTICS",
} as const;
export type CollaboratorPermission =
  (typeof CollaboratorPermission)[keyof typeof CollaboratorPermission];

export const SubscriptionScope = {
  EVENT: "EVENT",
  ORGANIZER_CATEGORY: "ORGANIZER_CATEGORY",
  ORGANIZER_ALL: "ORGANIZER_ALL",
} as const;
export type SubscriptionScope = (typeof SubscriptionScope)[keyof typeof SubscriptionScope];

export const FriendshipStatus = {
  PENDING: "PENDING",
  ACCEPTED: "ACCEPTED",
  REJECTED: "REJECTED",
  CANCELLED: "CANCELLED",
} as const;
export type FriendshipStatus = (typeof FriendshipStatus)[keyof typeof FriendshipStatus];

export const EventInvitationStatus = {
  PENDING: "PENDING",
  ACCEPTED: "ACCEPTED",
  DECLINED: "DECLINED",
  EXPIRED: "EXPIRED",
} as const;
export type EventInvitationStatus =
  (typeof EventInvitationStatus)[keyof typeof EventInvitationStatus];

export const ReviewStatus = {
  PUBLISHED: "PUBLISHED",
  HIDDEN: "HIDDEN",
  REMOVED: "REMOVED",
} as const;
export type ReviewStatus = (typeof ReviewStatus)[keyof typeof ReviewStatus];

export const ReportTargetType = {
  EVENT: "EVENT",
  USER: "USER",
  REVIEW: "REVIEW",
} as const;
export type ReportTargetType = (typeof ReportTargetType)[keyof typeof ReportTargetType];

export const ReportStatus = {
  OPEN: "OPEN",
  IN_REVIEW: "IN_REVIEW",
  RESOLVED: "RESOLVED",
  DISMISSED: "DISMISSED",
} as const;
export type ReportStatus = (typeof ReportStatus)[keyof typeof ReportStatus];

export const NotificationType = {
  REGISTRATION_RECEIVED: "REGISTRATION_RECEIVED",
  REGISTRATION_APPROVED: "REGISTRATION_APPROVED",
  REGISTRATION_REJECTED: "REGISTRATION_REJECTED",
  PAYMENT_PENDING: "PAYMENT_PENDING",
  PAYMENT_CONFIRMED: "PAYMENT_CONFIRMED",
  EVENT_CHANGED: "EVENT_CHANGED",
  EVENT_CANCELLED: "EVENT_CANCELLED",
  EVENT_REMINDER_24H: "EVENT_REMINDER_24H",
  EVENT_REMINDER_1H: "EVENT_REMINDER_1H",
  EVENT_MIN_PARTICIPANTS_WARNING: "EVENT_MIN_PARTICIPANTS_WARNING",
  ORGANIZER_NEW_EVENT: "ORGANIZER_NEW_EVENT",
  FRIEND_REQUEST: "FRIEND_REQUEST",
  FRIEND_ACCEPTED: "FRIEND_ACCEPTED",
  FRIEND_EVENT_REGISTERED: "FRIEND_EVENT_REGISTERED",
  WAITLIST_SPOT_OPENED: "WAITLIST_SPOT_OPENED",
  REVIEW_REQUEST: "REVIEW_REQUEST",
  CATEGORY_MERGED: "CATEGORY_MERGED",
  DISTRICT_MERGED: "DISTRICT_MERGED",
} as const;
export type NotificationType = (typeof NotificationType)[keyof typeof NotificationType];

export const NotificationChannel = {
  IN_APP: "IN_APP",
  PUSH: "PUSH",
  EMAIL: "EMAIL",
} as const;
export type NotificationChannel = (typeof NotificationChannel)[keyof typeof NotificationChannel];

export const NotificationDeliveryStatus = {
  PENDING: "PENDING",
  SENT: "SENT",
  FAILED: "FAILED",
} as const;
export type NotificationDeliveryStatus =
  (typeof NotificationDeliveryStatus)[keyof typeof NotificationDeliveryStatus];

export const DevicePlatform = {
  IOS: "IOS",
  ANDROID: "ANDROID",
  WEB: "WEB",
} as const;
export type DevicePlatform = (typeof DevicePlatform)[keyof typeof DevicePlatform];

export const EventAnalyticsAction = {
  IMPRESSION: "IMPRESSION",
  VIEW: "VIEW",
  SAVE: "SAVE",
  UNSAVE: "UNSAVE",
  SHARE: "SHARE",
  REGISTRATION_STARTED: "REGISTRATION_STARTED",
  REGISTERED: "REGISTERED",
  CANCELLED: "CANCELLED",
  PAYMENT_LINK_CLICK: "PAYMENT_LINK_CLICK",
  SUBSCRIBED: "SUBSCRIBED",
} as const;
export type EventAnalyticsAction =
  (typeof EventAnalyticsAction)[keyof typeof EventAnalyticsAction];

/** Traffic source recorded alongside analytics events, used for organizer stats (§35). */
export const AnalyticsSource = {
  DISCOVER_SWIPE: "SWIPE",
  SEARCH: "SEARCH",
  PROFILE: "PROFILE",
  DIRECT_LINK: "DIRECT_LINK",
  THREADS: "THREADS",
  OTHER: "OTHER",
} as const;
export type AnalyticsSource = (typeof AnalyticsSource)[keyof typeof AnalyticsSource];

export const UserEventInteraction = {
  PASS: "PASS",
  OPEN: "OPEN",
} as const;
export type UserEventInteraction = (typeof UserEventInteraction)[keyof typeof UserEventInteraction];

export const ListingCreditType = {
  GRANT: "GRANT",
  PURCHASE: "PURCHASE",
  EVENT_PUBLICATION: "EVENT_PUBLICATION",
  REFUND: "REFUND",
  ADMIN_ADJUSTMENT: "ADMIN_ADJUSTMENT",
  PROMO: "PROMO",
} as const;
export type ListingCreditType = (typeof ListingCreditType)[keyof typeof ListingCreditType];

export const PaymentProvider = {
  WAYFORPAY: "WAYFORPAY",
  MONO: "MONO",
  MANUAL_IBAN: "MANUAL_IBAN",
} as const;
export type PaymentProvider = (typeof PaymentProvider)[keyof typeof PaymentProvider];

export const PlatformPaymentStatus = {
  PENDING: "PENDING",
  PAID: "PAID",
  FAILED: "FAILED",
  CANCELLED: "CANCELLED",
  REFUNDED: "REFUNDED",
} as const;
export type PlatformPaymentStatus =
  (typeof PlatformPaymentStatus)[keyof typeof PlatformPaymentStatus];

export const ModerationStatus = {
  PENDING: "PENDING",
  APPROVED: "APPROVED",
  REJECTED: "REJECTED",
} as const;
export type ModerationStatus = (typeof ModerationStatus)[keyof typeof ModerationStatus];

export const ModerationReasonCode = {
  SENSITIVE_KEYWORDS: "SENSITIVE_KEYWORDS",
  WAR_RELATED: "WAR_RELATED",
  ADULT_CONTENT: "ADULT_CONTENT",
  USER_REPORTED: "USER_REPORTED",
  MANUAL_REVIEW: "MANUAL_REVIEW",
} as const;
export type ModerationReasonCode = (typeof ModerationReasonCode)[keyof typeof ModerationReasonCode];

export const Locale = {
  UK: "uk",
  EN: "en",
} as const;
export type Locale = (typeof Locale)[keyof typeof Locale];

export const ThemePreference = {
  LIGHT: "light",
  DARK: "dark",
  SYSTEM: "system",
} as const;
export type ThemePreference = (typeof ThemePreference)[keyof typeof ThemePreference];

export const FeatureFlagKey = {
  EMAIL_NOTIFICATIONS: "EMAIL_NOTIFICATIONS",
  SOCIAL_LOGIN: "SOCIAL_LOGIN",
  AI_CATEGORY_SUGGESTIONS: "AI_CATEGORY_SUGGESTIONS",
  MEDIA_AUTO_MODERATION: "MEDIA_AUTO_MODERATION",
} as const;
export type FeatureFlagKey = (typeof FeatureFlagKey)[keyof typeof FeatureFlagKey];
