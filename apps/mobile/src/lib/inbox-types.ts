export interface InquiryPerson {
  id: string;
  name: string | null;
  nickname: string | null;
  avatarUrl: string | null;
}

export interface InquiryListItem {
  id: string;
  event: { id: string; slug: string; title: string };
  role: "ASKER" | "ORGANIZER";
  counterpart: InquiryPerson;
  lastMessage: { text: string; createdAt: string; mine: boolean } | null;
  lastMessageAt: string;
  unread: number;
}

export interface InquiryThread {
  id: string;
  event: { id: string; slug: string; title: string };
  role: "ASKER" | "ORGANIZER";
  counterpart: InquiryPerson | null;
  messages: { id: string; text: string; createdAt: string; mine: boolean }[];
}

export interface InquiryByEvent {
  id: string | null;
  isOwner: boolean;
  event: { id: string; slug: string; title: string; registrationMode: string; externalRegistrationUrl: string | null };
}

export const personName = (p: { name: string | null; nickname: string | null } | null | undefined) => p?.name ?? p?.nickname ?? "";
