import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { ResourceNotFoundException, ForbiddenActionException } from "../common/exceptions/common-exceptions";
import type { SubscribeToOrganizerDto } from "./dto/subscribe-to-organizer.dto";

/** §33 — follow a specific event, an organizer within one category, or every event an organizer publishes. */
@Injectable()
export class SubscriptionsService {
  constructor(private readonly prisma: PrismaService) {}

  /** UX §25's "Слідкувати" button on an event page: EVENT + (if missing) ORGANIZER_CATEGORY. */
  async subscribeToEvent(userId: string, eventId: string) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: { id: true, ownerId: true, categoryId: true },
    });
    if (!event) throw new ResourceNotFoundException("Event not found");

    const eventSub = await this.upsertActive({ userId, scope: "EVENT", eventId });

    if (event.categoryId) {
      await this.upsertActive({ userId, scope: "ORGANIZER_CATEGORY", organizerId: event.ownerId, categoryId: event.categoryId });
    }

    return eventSub;
  }

  async unsubscribeFromEvent(userId: string, eventId: string): Promise<void> {
    await this.prisma.subscription.updateMany({
      where: { userId, scope: "EVENT", eventId, active: true },
      data: { active: false },
    });
  }

  /** UX §25's category picker + "Вибрати всі" (allEvents -> ORGANIZER_ALL). */
  async subscribeToOrganizer(userId: string, organizerId: string, dto: SubscribeToOrganizerDto) {
    const organizer = await this.prisma.user.findUnique({ where: { id: organizerId }, select: { id: true } });
    if (!organizer) throw new ResourceNotFoundException("Organizer not found");

    const created = [];
    for (const categoryId of dto.categoryIds ?? []) {
      created.push(await this.upsertActive({ userId, scope: "ORGANIZER_CATEGORY", organizerId, categoryId }));
    }
    if (dto.allEvents) {
      created.push(await this.upsertActive({ userId, scope: "ORGANIZER_ALL", organizerId }));
    }
    return created;
  }

  async unsubscribe(id: string, userId: string): Promise<void> {
    const subscription = await this.prisma.subscription.findUnique({ where: { id } });
    if (!subscription) throw new ResourceNotFoundException("Subscription not found");
    if (subscription.userId !== userId) throw new ForbiddenActionException();
    await this.prisma.subscription.update({ where: { id }, data: { active: false } });
  }

  async listMine(userId: string) {
    return this.prisma.subscription.findMany({
      where: { userId, active: true },
      include: {
        event: { select: { id: true, slug: true, title: true } },
        organizer: { select: { id: true, name: true, nickname: true, avatarUrl: true } },
        category: { select: { id: true, nameUk: true, nameEn: true } },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  /**
   * Re-activates a matching inactive row instead of creating a duplicate.
   * A DB unique constraint can't express this cleanly (several nullable
   * discriminator columns), so the dedup check lives here.
   */
  private async upsertActive(where: {
    userId: string;
    scope: "EVENT" | "ORGANIZER_CATEGORY" | "ORGANIZER_ALL";
    eventId?: string;
    organizerId?: string;
    categoryId?: string;
  }) {
    const existing = await this.prisma.subscription.findFirst({
      where: {
        userId: where.userId,
        scope: where.scope,
        eventId: where.eventId ?? null,
        organizerId: where.organizerId ?? null,
        categoryId: where.categoryId ?? null,
      },
    });
    if (existing) {
      if (existing.active) return existing;
      return this.prisma.subscription.update({ where: { id: existing.id }, data: { active: true } });
    }
    return this.prisma.subscription.create({ data: where });
  }
}
