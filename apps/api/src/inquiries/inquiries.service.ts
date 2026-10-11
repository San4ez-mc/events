import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { ApiException } from "../common/exceptions/api.exception";
import { ForbiddenActionException, ResourceNotFoundException } from "../common/exceptions/common-exceptions";
import { NotificationsService } from "../notifications/notifications.service";

const PREVIEW_LENGTH = 120;
const PERSON = { id: true, name: true, nickname: true, avatarUrl: true } as const;

const personName = (u: { name: string | null; nickname: string | null }) => u.name ?? u.nickname ?? "";
const preview = (text: string) => (text.length > PREVIEW_LENGTH ? `${text.slice(0, PREVIEW_LENGTH - 1)}…` : text);

/**
 * "Write to the organizer": a private, per-event conversation between one person and the event's organizer. People with
 * a question before (or after) registering had no way to ask; the organizer had nowhere to answer. External events
 * (tickets sold elsewhere) link to the organizer's own site instead, so this is for events registered on Kiro.
 */
@Injectable()
export class InquiriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  /** The asker sends a question about an event (starts the conversation or adds to the existing one). */
  async ask(userId: string, eventId: string, text: string) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: { id: true, slug: true, title: true, ownerId: true, status: true, registrationMode: true },
    });
    if (!event || !["PUBLISHED", "COMPLETED"].includes(event.status)) throw new ResourceNotFoundException("Event not found");
    if (event.ownerId === userId) throw new ApiException("VALIDATION_ERROR", "You can't message yourself", 400);
    if (event.registrationMode === "EXTERNAL") {
      throw new ApiException("VALIDATION_ERROR", "This event is organized elsewhere: use the organizer's link on the event", 400);
    }
    await this.assertNotBlocked(userId, event.ownerId);

    const inquiry = await this.prisma.eventInquiry.upsert({
      where: { eventId_askerId: { eventId, askerId: userId } },
      create: { eventId, askerId: userId, organizerId: event.ownerId },
      update: {},
    });
    await this.addMessage(inquiry.id, userId, text);
    await this.notifyOther({ inquiryId: inquiry.id, senderId: userId, recipientId: event.ownerId, event, text, fromAsker: true });
    return { id: inquiry.id };
  }

  /** Either side adds a message to an existing conversation. */
  async reply(userId: string, inquiryId: string, text: string) {
    const inquiry = await this.getParticipantInquiry(userId, inquiryId);
    const recipientId = inquiry.askerId === userId ? inquiry.organizerId : inquiry.askerId;
    await this.assertNotBlocked(userId, recipientId);
    await this.addMessage(inquiryId, userId, text);
    await this.notifyOther({ inquiryId, senderId: userId, recipientId, event: inquiry.event, text, fromAsker: inquiry.askerId === userId });
    return { id: inquiryId };
  }

  /** Conversations the person is in, as an asker or as an organizer: newest first, with the last message and unread count. */
  async listMine(userId: string) {
    const rows = await this.prisma.eventInquiry.findMany({
      where: { OR: [{ askerId: userId }, { organizerId: userId }] },
      orderBy: { lastMessageAt: "desc" },
      take: 100,
      include: {
        event: { select: { id: true, slug: true, title: true } },
        asker: { select: PERSON },
        organizer: { select: PERSON },
        messages: { orderBy: { createdAt: "desc" }, take: 1, select: { text: true, createdAt: true, senderId: true } },
      },
    });
    const unread = await this.prisma.inquiryMessage.groupBy({
      by: ["inquiryId"],
      where: { inquiryId: { in: rows.map((r) => r.id) }, senderId: { not: userId }, readAt: null },
      _count: { _all: true },
    });
    const unreadBy = new Map(unread.map((u) => [u.inquiryId, u._count._all]));
    return rows.map((r) => {
      const asOrganizer = r.organizerId === userId;
      const last = r.messages[0];
      return {
        id: r.id,
        event: r.event,
        role: asOrganizer ? "ORGANIZER" : "ASKER",
        counterpart: asOrganizer ? r.asker : r.organizer,
        lastMessage: last ? { text: preview(last.text), createdAt: last.createdAt, mine: last.senderId === userId } : null,
        lastMessageAt: r.lastMessageAt,
        unread: unreadBy.get(r.id) ?? 0,
      };
    });
  }

  /** The asker's own conversation about an event, if they've started one. */
  async getByEvent(userId: string, eventId: string) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: { id: true, slug: true, title: true, ownerId: true, status: true, registrationMode: true, externalRegistrationUrl: true },
    });
    if (!event) throw new ResourceNotFoundException("Event not found");
    const inquiry = await this.prisma.eventInquiry.findUnique({ where: { eventId_askerId: { eventId, askerId: userId } }, select: { id: true } });
    return {
      id: inquiry?.id ?? null,
      isOwner: event.ownerId === userId,
      event: { id: event.id, slug: event.slug, title: event.title, registrationMode: event.registrationMode, externalRegistrationUrl: event.externalRegistrationUrl },
    };
  }

  /** One conversation with its messages; opening it marks the other side's messages as read. */
  async get(userId: string, inquiryId: string) {
    const inquiry = await this.getParticipantInquiry(userId, inquiryId);
    const asOrganizer = inquiry.organizerId === userId;
    const [messages, counterpart] = await Promise.all([
      this.prisma.inquiryMessage.findMany({ where: { inquiryId }, orderBy: { createdAt: "asc" }, take: 500, select: { id: true, senderId: true, text: true, createdAt: true } }),
      this.prisma.user.findUnique({ where: { id: asOrganizer ? inquiry.askerId : inquiry.organizerId }, select: PERSON }),
    ]);
    await this.prisma.inquiryMessage.updateMany({ where: { inquiryId, senderId: { not: userId }, readAt: null }, data: { readAt: new Date() } });
    return {
      id: inquiry.id,
      event: inquiry.event,
      role: asOrganizer ? "ORGANIZER" : "ASKER",
      counterpart,
      messages: messages.map((m) => ({ id: m.id, text: m.text, createdAt: m.createdAt, mine: m.senderId === userId })),
    };
  }

  private async getParticipantInquiry(userId: string, inquiryId: string) {
    const inquiry = await this.prisma.eventInquiry.findUnique({
      where: { id: inquiryId },
      include: { event: { select: { id: true, slug: true, title: true } } },
    });
    if (!inquiry) throw new ResourceNotFoundException("Conversation not found");
    if (inquiry.askerId !== userId && inquiry.organizerId !== userId) throw new ForbiddenActionException();
    return inquiry;
  }

  private async addMessage(inquiryId: string, senderId: string, text: string) {
    const [message] = await this.prisma.$transaction([
      this.prisma.inquiryMessage.create({ data: { inquiryId, senderId, text } }),
      this.prisma.eventInquiry.update({ where: { id: inquiryId }, data: { lastMessageAt: new Date() } }),
    ]);
    return message;
  }

  private async assertNotBlocked(a: string, b: string) {
    const block = await this.prisma.userBlock.findFirst({
      where: { OR: [{ blockerId: a, blockedUserId: b }, { blockerId: b, blockedUserId: a }] },
      select: { id: true },
    });
    if (block) throw new ApiException("USER_BLOCKED", "You can't message this person", 403);
  }

  /** One unread notification per conversation: a burst of messages must not become a burst of notifications. */
  private async notifyOther(params: {
    inquiryId: string;
    senderId: string;
    recipientId: string;
    event: { id: string; slug: string; title: string };
    text: string;
    fromAsker: boolean;
  }) {
    const pending = await this.prisma.notification.findFirst({
      where: { userId: params.recipientId, type: "ORGANIZER_MESSAGE", readAt: null, payloadJson: { path: ["inquiryId"], equals: params.inquiryId } },
      select: { id: true },
    });
    if (pending) return;
    const sender = await this.prisma.user.findUnique({ where: { id: params.senderId }, select: { name: true, nickname: true } });
    await this.notifications
      .create({
        userId: params.recipientId,
        type: "ORGANIZER_MESSAGE",
        title: params.fromAsker ? "New question" : "New reply",
        body: params.fromAsker
          ? `${sender ? personName(sender) : "Someone"} asked about "${params.event.title}": ${preview(params.text)}`
          : `The organizer replied about "${params.event.title}": ${preview(params.text)}`,
        payloadJson: { eventId: params.event.id, slug: params.event.slug, inquiryId: params.inquiryId },
      })
      .catch(() => undefined);
  }
}
