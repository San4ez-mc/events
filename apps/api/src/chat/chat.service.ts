import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { ApiException } from "../common/exceptions/api.exception";
import { ResourceNotFoundException } from "../common/exceptions/common-exceptions";

/** Statuses that count as a confirmed participant for chat access (UX §28). */
const CHAT_REGISTRATION_STATUSES = [
  "REGISTERED",
  "CONFIRMED",
  "ATTENDED",
] as const;
const PAGE_SIZE = 50;

const AUTHOR_SELECT = {
  id: true,
  name: true,
  nickname: true,
  avatarUrl: true,
} as const;

/**
 * UX §28 — simple per-event group chat. Writers: confirmed participants,
 * the organizer and co-organizers with MANAGE_CHAT. Cancelling a
 * registration removes access automatically (status stops matching).
 */
@Injectable()
export class ChatService {
  constructor(private readonly prisma: PrismaService) {}

  private async assertAccess(
    eventId: string,
    userId: string,
  ): Promise<{ isModerator: boolean }> {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: { id: true, ownerId: true, status: true },
    });
    if (!event) throw new ResourceNotFoundException("Event not found");
    if (event.status === "DRAFT")
      throw new ApiException("FORBIDDEN", "Chat is not available yet", 403);

    if (event.ownerId === userId) return { isModerator: true };

    const collaborator = await this.prisma.eventCollaborator.findUnique({
      where: { eventId_userId: { eventId, userId } },
      select: { permissions: true },
    });
    if (collaborator?.permissions.includes("MANAGE_CHAT"))
      return { isModerator: true };

    const registration = await this.prisma.registration.findUnique({
      where: { eventId_userId: { eventId, userId } },
      select: { status: true },
    });
    if (
      registration &&
      (CHAT_REGISTRATION_STATUSES as readonly string[]).includes(
        registration.status,
      )
    ) {
      return { isModerator: false };
    }
    throw new ApiException(
      "FORBIDDEN",
      "Only confirmed participants can use the event chat",
      403,
    );
  }

  /** Newest `PAGE_SIZE` messages (oldest first), or the page before `beforeId` for "load earlier". */
  async list(eventId: string, userId: string, beforeId?: string) {
    const { isModerator } = await this.assertAccess(eventId, userId);

    const before = beforeId
      ? await this.prisma.eventChatMessage.findUnique({
          where: { id: beforeId },
          select: { createdAt: true },
        })
      : null;

    const rows = await this.prisma.eventChatMessage.findMany({
      where: {
        eventId,
        ...(before ? { createdAt: { lt: before.createdAt } } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: PAGE_SIZE + 1,
      include: { author: { select: AUTHOR_SELECT } },
    });
    const hasMore = rows.length > PAGE_SIZE;
    const page = (hasMore ? rows.slice(0, PAGE_SIZE) : rows).reverse();

    return {
      items: page.map((m) => ({
        id: m.id,
        text: m.text,
        createdAt: m.createdAt,
        author: {
          id: m.author.id,
          name: m.author.name ?? m.author.nickname,
          avatarUrl: m.author.avatarUrl,
        },
        mine: m.authorId === userId,
      })),
      hasMore,
      isModerator,
    };
  }

  async post(eventId: string, userId: string, text: string) {
    await this.assertAccess(eventId, userId);
    const message = await this.prisma.eventChatMessage.create({
      data: { eventId, authorId: userId, text },
      include: { author: { select: AUTHOR_SELECT } },
    });
    return {
      id: message.id,
      text: message.text,
      createdAt: message.createdAt,
      author: {
        id: message.author.id,
        name: message.author.name ?? message.author.nickname,
        avatarUrl: message.author.avatarUrl,
      },
      mine: true,
    };
  }

  /** Authors delete their own messages; organizers / MANAGE_CHAT co-organizers can remove anyone's. */
  async remove(
    eventId: string,
    userId: string,
    messageId: string,
  ): Promise<void> {
    const { isModerator } = await this.assertAccess(eventId, userId);
    const message = await this.prisma.eventChatMessage.findFirst({
      where: { id: messageId, eventId },
    });
    if (!message) throw new ResourceNotFoundException("Message not found");
    if (message.authorId !== userId && !isModerator)
      throw new ApiException("FORBIDDEN", "Not allowed", 403);
    await this.prisma.eventChatMessage.delete({ where: { id: messageId } });
  }
}
