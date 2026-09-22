import type { NotificationType } from "@kiro/types";

export interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  payloadJson: { eventId?: string; registrationId?: string } | null;
  readAt: string | null;
  createdAt: string;
}
