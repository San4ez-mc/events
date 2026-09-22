import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PAGINATION } from "@kiro/config";
import type { CursorPage } from "@kiro/types";
import { PrismaService } from "../prisma/prisma.service";
import { UsersService } from "../users/users.service";
import { CreditsService } from "../credits/credits.service";
import { SensitiveContentService } from "../moderation/sensitive-content.service";
import { ModerationService } from "../moderation/moderation.service";
import { ApiException } from "../common/exceptions/api.exception";
import { ForbiddenActionException, ResourceNotFoundException } from "../common/exceptions/common-exceptions";
import { slugifyUnique } from "../common/utils/slugify";
import { ACTIVE_REGISTRATION_STATUSES } from "../common/constants/registration-active-statuses";
import { NotificationsService } from "../notifications/notifications.service";
import { FriendsService } from "../friends/friends.service";
import type { CreateEventDto } from "./dto/create-event.dto";
import type { UpdateEventDto } from "./dto/update-event.dto";
import type { ListMyEventsDto } from "./dto/list-my-events.dto";

/** Changing any of these on an already-published event requires explicit confirmation (§78). */
const SIGNIFICANT_PUBLISHED_FIELDS = ["startsAt", "addressText", "cityId", "districtId", "onlineUrl"] as const;

@Injectable()
export class EventsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
    private readonly creditsService: CreditsService,
    private readonly sensitiveContentService: SensitiveContentService,
    private readonly moderationService: ModerationService,
    private readonly notifications: NotificationsService,
    private readonly friendsService: FriendsService,
  ) {}

  /** §10 — creating a first event is what makes a user an "organizer" (not a role). */
  async create(ownerId: string, dto: CreateEventDto) {
    await this.usersService.activateOrganizerIfNeeded(ownerId);

    const slug = await this.generateUniqueSlug(dto.title);

    return this.prisma.event.create({
      data: {
        ownerId,
        title: dto.title,
        slug,
      },
      include: { media: true, category: true, city: true, district: true },
    });
  }

  async update(eventId: string, userId: string, dto: UpdateEventDto) {
    const event = await this.getOwnedEvent(eventId, userId);

    const touchesSignificantField = SIGNIFICANT_PUBLISHED_FIELDS.some(
      (field) => (dto as Record<string, unknown>)[field] !== undefined,
    );
    if (event.status === "PUBLISHED") {
      if (touchesSignificantField && !dto.notifyParticipants) {
        throw new ApiException(
          "VALIDATION_ERROR",
          "Changing date/location/online-URL on a published event requires notifyParticipants=true (§78)",
          400,
        );
      }
    }

    if (dto.categoryId) {
      const category = await this.prisma.category.findUnique({ where: { id: dto.categoryId } });
      if (!category || category.status !== "ACTIVE") {
        throw new ApiException("VALIDATION_ERROR", "Category not found", 400, {
          categoryId: ["Category not found or inactive"],
        });
      }
    }
    if (dto.cityId) {
      const city = await this.prisma.city.findUnique({ where: { id: dto.cityId } });
      if (!city || city.status !== "ACTIVE") {
        throw new ApiException("VALIDATION_ERROR", "City not found", 400, { cityId: ["City not found"] });
      }
    }
    if (dto.districtId) {
      const district = await this.prisma.district.findUnique({ where: { id: dto.districtId } });
      if (!district || district.status !== "ACTIVE") {
        throw new ApiException("VALIDATION_ERROR", "District not found", 400, {
          districtId: ["District not found"],
        });
      }
    }

    const slug =
      dto.title && event.status === "DRAFT" && dto.title !== event.title
        ? await this.generateUniqueSlug(dto.title)
        : undefined;

    const { notifyParticipants: _notifyParticipants, ...data } = dto;

    const updateData: Prisma.EventUncheckedUpdateInput = {
      ...data,
      ...(slug ? { slug } : {}),
      addressDetails: dto.addressDetails as Prisma.InputJsonValue | undefined,
      startsAt: dto.startsAt ? new Date(dto.startsAt) : undefined,
      endsAt: dto.endsAt ? new Date(dto.endsAt) : undefined,
      registrationDeadline: dto.registrationDeadline ? new Date(dto.registrationDeadline) : undefined,
    };

    const updated = await this.prisma.event.update({
      where: { id: eventId },
      data: updateData,
      include: { media: true, category: true, city: true, district: true },
    });

    if (event.status === "PUBLISHED" && touchesSignificantField && dto.notifyParticipants) {
      await this.notifyActiveRegistrants(eventId, {
        type: "EVENT_CHANGED",
        title: "Event details changed",
        body: `The organizer updated the date, location, or link for "${updated.title}".`,
      });
    }

    return updated;
  }

  async findMine(userId: string, params: ListMyEventsDto): Promise<CursorPage<unknown>> {
    const limit = Math.min(params.limit ?? PAGINATION.defaultLimit, PAGINATION.maxLimit);

    const events = await this.prisma.event.findMany({
      where: { ownerId: userId, status: params.status },
      orderBy: { createdAt: "desc" },
      take: limit + 1,
      ...(params.cursor ? { cursor: { id: params.cursor }, skip: 1 } : {}),
      include: { media: { orderBy: { sortOrder: "asc" }, take: 1 } },
    });

    const hasMore = events.length > limit;
    const items = hasMore ? events.slice(0, limit) : events;

    return {
      items,
      nextCursor: hasMore ? items[items.length - 1]!.id : null,
      hasMore,
    };
  }

  async findByIdForOwner(eventId: string, userId: string) {
    await this.getOwnedEvent(eventId, userId);
    // Re-fetch with the same relations the wizard/edit UI needs, rather than
    // making callers hit /events/slug/:slug just to get media/category/etc.
    return this.prisma.event.findUniqueOrThrow({
      where: { id: eventId },
      include: {
        media: { orderBy: { sortOrder: "asc" } },
        category: true,
        city: true,
        district: true,
        registrationFields: { orderBy: { sortOrder: "asc" } },
      },
    });
  }

  /**
   * Public event page + owner preview in one endpoint. Published events
   * (public or link-only — both are reachable by direct URL per §39) are
   * visible to anyone; unpublished ones are visible only to their owner,
   * which is what makes this safe to also serve as the "preview my draft"
   * view (§115 Phase 1 acceptance criterion).
   */
  async findBySlugForPreview(slug: string, requesterId: string | undefined) {
    const event = await this.prisma.event.findUnique({
      where: { slug },
      include: {
        media: { orderBy: { sortOrder: "asc" } },
        category: true,
        city: true,
        district: true,
        registrationFields: { orderBy: { sortOrder: "asc" } },
      },
    });
    if (!event) throw new ResourceNotFoundException("Event not found");

    if (event.status !== "PUBLISHED" && event.ownerId !== requesterId) {
      // Deliberately the same NOT_FOUND as a missing event — don't leak the
      // existence of someone else's draft via a 403 (§10: never trust the
      // frontend to hide this; the backend must actively refuse to reveal it).
      throw new ResourceNotFoundException("Event not found");
    }

    return { ...event, friendsGoing: await this.getFriendsGoing(event.id, requesterId) };
  }

  /**
   * §52/§55 — the publication transaction. Three outcomes:
   *  - REJECT (hard-blocked content, §54): event -> REJECTED, no charge, no
   *    moderation case (there's nothing to review — it's just not allowed).
   *  - FLAG (e.g. war-related, §54): event -> PENDING_MODERATION, a
   *    ModerationCase is opened, credit is NOT charged yet (§55 — reserved,
   *    not consumed, until an admin approves in Phase 10).
   *  - ALLOW: credit is debited and event -> PUBLISHED, atomically with the
   *    status change (single transaction, §52).
   * Idempotent either way: publishing an already-PUBLISHED event again is a
   * no-op (§98 — a retried request must not double-charge).
   */
  async publish(eventId: string, userId: string) {
    const event = await this.getOwnedEvent(eventId, userId);

    if (event.status === "PUBLISHED") {
      return this.prisma.event.findUniqueOrThrow({ where: { id: eventId } });
    }
    if (event.status !== "DRAFT") {
      throw new ApiException(
        "EVENT_NOT_PUBLISHABLE",
        `Cannot publish an event with status ${event.status}`,
        400,
      );
    }

    this.assertPublishable(event);

    const scan = this.sensitiveContentService.scan(event.title, event.description, event.rules);

    if (scan.decision === "REJECT") {
      await this.prisma.event.update({ where: { id: eventId }, data: { status: "REJECTED" } });
      throw new ApiException(
        "VALIDATION_ERROR",
        "This event's content isn't allowed on Kiro (§54)",
        400,
      );
    }

    if (scan.decision === "FLAG") {
      return this.prisma.$transaction(async (tx) => {
        await tx.event.update({ where: { id: eventId }, data: { status: "PENDING_MODERATION" } });
        await this.moderationService.openCase({
          targetType: "EVENT",
          targetId: eventId,
          reasonCode: scan.reasonCode,
          details: `Matched term: "${scan.matchedTerm}"`,
        });
        return tx.event.findUniqueOrThrow({ where: { id: eventId } });
      });
    }

    return this.prisma.$transaction(async (tx) => {
      await this.creditsService.debitForPublication(tx, userId, eventId);
      return tx.event.update({
        where: { id: eventId },
        data: { status: "PUBLISHED", publishedAt: new Date() },
      });
    });
  }

  /**
   * §79 — cancels an event. Never deletes it. Existing registrations are
   * left as-is status-wise (attendees decide whether to also cancel
   * individually) — cancelling the event just stops new registrations and
   * notifies everyone currently registered (§44).
   */
  async cancel(eventId: string, userId: string, reason: string | undefined) {
    const event = await this.getOwnedEvent(eventId, userId);
    if (event.status === "CANCELLED") return event;
    if (event.status !== "PUBLISHED" && event.status !== "PENDING_MODERATION") {
      throw new ApiException(
        "VALIDATION_ERROR",
        `Cannot cancel an event with status ${event.status}`,
        400,
      );
    }

    const cancelled = await this.prisma.event.update({
      where: { id: eventId },
      data: { status: "CANCELLED", cancelledAt: new Date(), cancellationReason: reason },
    });
    await this.notifyActiveRegistrants(eventId, {
      type: "EVENT_CANCELLED",
      title: "Event cancelled",
      body: reason ? `"${cancelled.title}" was cancelled: ${reason}` : `"${cancelled.title}" was cancelled.`,
    });
    return cancelled;
  }

  /**
   * §34/UX §4's "👥 N твої друзі йдуть" — only counts actually-going statuses
   * (not PENDING, which just means "applied, not yet approved"), and only
   * for an authenticated viewer with accepted friends.
   */
  private async getFriendsGoing(eventId: string, viewerId: string | undefined) {
    if (!viewerId) return { count: 0, previews: [] as { id: string; name: string | null; avatarUrl: string | null }[] };

    const friendIds = await this.friendsService.getFriendIds(viewerId);
    if (friendIds.length === 0) return { count: 0, previews: [] };

    const registrations = await this.prisma.registration.findMany({
      where: { eventId, userId: { in: friendIds }, status: { in: ["REGISTERED", "PAYMENT_PENDING", "CONFIRMED"] } },
      select: { user: { select: { id: true, name: true, nickname: true, avatarUrl: true } } },
      take: 5,
    });
    const count = await this.prisma.registration.count({
      where: { eventId, userId: { in: friendIds }, status: { in: ["REGISTERED", "PAYMENT_PENDING", "CONFIRMED"] } },
    });

    return {
      count,
      previews: registrations.map((r) => ({ id: r.user.id, name: r.user.name ?? r.user.nickname, avatarUrl: r.user.avatarUrl })),
    };
  }

  /** §44/§79 — notifies everyone with an active registration for an event, e.g. on cancellation or a significant change. */
  private async notifyActiveRegistrants(
    eventId: string,
    notification: { type: "EVENT_CHANGED" | "EVENT_CANCELLED"; title: string; body: string },
  ): Promise<void> {
    const registrations = await this.prisma.registration.findMany({
      where: { eventId, status: { in: [...ACTIVE_REGISTRATION_STATUSES] } },
      select: { userId: true },
    });
    await Promise.all(
      registrations.map(({ userId }) =>
        this.notifications.create({
          userId,
          type: notification.type,
          title: notification.title,
          body: notification.body,
          payloadJson: { eventId },
        }),
      ),
    );
  }

  /** §69 — the minimum fields required to publish (drafts may be incomplete until this point). */
  private assertPublishable(event: {
    title: string;
    categoryId: string | null;
    startsAt: Date | null;
    description: string | null;
    format: string;
    cityId: string | null;
    addressText: string | null;
    onlineUrl: string | null;
    priceType: string;
  }): void {
    const missing: string[] = [];
    if (!event.title?.trim()) missing.push("title");
    if (!event.categoryId) missing.push("categoryId");
    if (!event.startsAt) missing.push("startsAt");
    if (!event.description?.trim()) missing.push("description");
    if (event.format === "OFFLINE" && !event.cityId) missing.push("cityId");
    if (event.format === "ONLINE" && !event.onlineUrl) missing.push("onlineUrl");

    if (missing.length > 0) {
      throw new ApiException("VALIDATION_ERROR", "Event is missing required fields to publish", 400, {
        _: missing,
      });
    }
  }

  private async getOwnedEvent(eventId: string, userId: string) {
    const event = await this.prisma.event.findUnique({ where: { id: eventId } });
    if (!event) throw new ResourceNotFoundException("Event not found");
    // Phase 7 adds co-organizers (event_collaborators) with scoped
    // permissions — until then, only the owner can edit.
    if (event.ownerId !== userId) throw new ForbiddenActionException();
    return event;
  }

  private async generateUniqueSlug(title: string): Promise<string> {
    let slug = slugifyUnique(title);
    // Extremely unlikely collision given the random suffix, but a unique
    // constraint violation on event creation would be a confusing 500 —
    // guard it explicitly instead of trusting randomness blindly.
    while (await this.prisma.event.findUnique({ where: { slug } })) {
      slug = slugifyUnique(title);
    }
    return slug;
  }
}
