import { Injectable } from "@nestjs/common";
import type { Event, Prisma } from "@prisma/client";
import { PAGINATION } from "@kiro/config";
import type { CursorPage } from "@kiro/types";
import { PrismaService } from "../prisma/prisma.service";
import { UsersService } from "../users/users.service";
import { CreditsService } from "../credits/credits.service";
import { SensitiveContentService } from "../moderation/sensitive-content.service";
import { ModerationService } from "../moderation/moderation.service";
import { ApiException } from "../common/exceptions/api.exception";
import { ResourceNotFoundException } from "../common/exceptions/common-exceptions";
import { slugifyUnique } from "../common/utils/slugify";
import { ACTIVE_REGISTRATION_STATUSES } from "../common/constants/registration-active-statuses";
import { NotificationsService } from "../notifications/notifications.service";
import { FriendsService } from "../friends/friends.service";
import { EventAccessService } from "../organizer/event-access.service";
import { AnalyticsService } from "../analytics/analytics.service";
import { SocialProofService } from "../common/social-proof/social-proof.service";
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
    private readonly eventAccess: EventAccessService,
    private readonly socialProof: SocialProofService,
    private readonly analytics: AnalyticsService,
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
    return this.applyUpdate(event, dto);
  }

  /** Phase 10's `/admin/events/:id` — same field set and validation as the owner path, just no ownership gate. */
  async adminUpdate(eventId: string, dto: UpdateEventDto) {
    const event = await this.prisma.event.findUnique({ where: { id: eventId } });
    if (!event) throw new ResourceNotFoundException("Event not found");
    return this.applyUpdate(event, dto);
  }

  private async applyUpdate(event: Event, dto: UpdateEventDto) {
    const eventId = event.id;
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
   * view (§115 Phase 1 acceptance criterion). COMPLETED counts as publicly
   * visible too — it's just PUBLISHED's terminal state (§80), and Phase 8
   * reviews need the page reachable after the event ends.
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
        owner: { select: { id: true, name: true, nickname: true, avatarUrl: true, bio: true } },
      },
    });
    if (!event) throw new ResourceNotFoundException("Event not found");

    const publiclyVisibleStatuses: (typeof event.status)[] = ["PUBLISHED", "COMPLETED"];
    if (!publiclyVisibleStatuses.includes(event.status) && event.ownerId !== requesterId) {
      // Deliberately the same NOT_FOUND as a missing event — don't leak the
      // existence of someone else's draft via a 403 (§10: never trust the
      // frontend to hide this; the backend must actively refuse to reveal it).
      throw new ResourceNotFoundException("Event not found");
    }

    const [withSocial] = await this.socialProof.attach([event], requesterId);
    const organizerEventsCount = await this.prisma.event.count({
      where: { ownerId: event.ownerId, status: { in: ["PUBLISHED", "COMPLETED"] } },
    });

    // UX §10 — the exact address / meeting link is revealed only to the organizer
    // and to people who are actually registered; everyone else sees the district.
    const canSeeExactLocation = requesterId ? await this.canSeeExactLocation(event.id, event.ownerId, requesterId) : false;
    const locationFields = canSeeExactLocation
      ? {}
      : { addressText: null, addressDetails: null, googlePlaceId: null, latitude: null, longitude: null, onlineUrl: null };
    // §10/§83 — the public "Учасники" list: only people who opted in to being shown.
    const participantRows = await this.prisma.registration.findMany({
      where: { eventId: event.id, status: { in: ["REGISTERED", "PAYMENT_PENDING", "CONFIRMED"] }, showAsParticipant: true },
      orderBy: { registeredAt: "asc" },
      take: 50,
      select: { user: { select: { id: true, name: true, nickname: true, avatarUrl: true } } },
    });

    return {
      ...withSocial!,
      ...locationFields,
      addressLocked: !canSeeExactLocation && (event.format === "OFFLINE" || event.format === "ONLINE"),
      organizer: { ...event.owner, eventsCount: organizerEventsCount, rating: withSocial!.social.organizerRating },
      participants: participantRows.map((r) => ({ id: r.user.id, name: r.user.name ?? r.user.nickname, avatarUrl: r.user.avatarUrl })),
      friendsGoing: await this.getFriendsGoing(event.id, requesterId),
      reviewSummary: await this.getReviewSummary(event.id),
    };
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
    return this.applyCancel(event, reason);
  }

  /** Phase 10's `/admin/events/:id/cancel` — same effect, no ownership gate. */
  async adminCancel(eventId: string, reason: string | undefined) {
    const event = await this.prisma.event.findUnique({ where: { id: eventId } });
    if (!event) throw new ResourceNotFoundException("Event not found");
    return this.applyCancel(event, reason);
  }

  private async applyCancel(event: Event, reason: string | undefined) {
    const eventId = event.id;
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
   * §53/§55, Phase 10's admin moderation queue. Mirrors `publish`'s ALLOW
   * branch (debit -> PUBLISHED) — the credit was only ever reserved, never
   * consumed, while the event sat PENDING_MODERATION.
   */
  async approveModeration(eventId: string, adminId: string) {
    const event = await this.prisma.event.findUnique({ where: { id: eventId } });
    if (!event) throw new ResourceNotFoundException("Event not found");
    if (event.status !== "PENDING_MODERATION") {
      throw new ApiException("VALIDATION_ERROR", `Cannot approve an event with status ${event.status}`, 400);
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      await this.creditsService.debitForPublication(tx, event.ownerId, eventId);
      const published = await tx.event.update({
        where: { id: eventId },
        data: { status: "PUBLISHED", publishedAt: new Date() },
      });
      await tx.moderationCase.updateMany({
        where: { targetType: "EVENT", targetId: eventId, status: "PENDING" },
        data: { status: "APPROVED", resolvedAt: new Date(), resolvedByAdminId: adminId },
      });
      return published;
    });

    await this.notifications.create({
      userId: event.ownerId,
      type: "EVENT_CHANGED",
      title: "Event approved",
      body: `"${updated.title}" passed moderation and is now published.`,
      payloadJson: { eventId },
    });
    return updated;
  }

  /** No credit is charged — it was only ever reserved (§55). */
  async rejectModeration(eventId: string, adminId: string) {
    const event = await this.prisma.event.findUnique({ where: { id: eventId } });
    if (!event) throw new ResourceNotFoundException("Event not found");
    if (event.status !== "PENDING_MODERATION") {
      throw new ApiException("VALIDATION_ERROR", `Cannot reject an event with status ${event.status}`, 400);
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const rejected = await tx.event.update({ where: { id: eventId }, data: { status: "REJECTED" } });
      await tx.moderationCase.updateMany({
        where: { targetType: "EVENT", targetId: eventId, status: "PENDING" },
        data: { status: "REJECTED", resolvedAt: new Date(), resolvedByAdminId: adminId },
      });
      return rejected;
    });

    await this.notifications.create({
      userId: event.ownerId,
      type: "EVENT_CHANGED",
      title: "Event rejected",
      body: `"${updated.title}" didn't pass moderation and wasn't published.`,
      payloadJson: { eventId },
    });
    return updated;
  }

  /**
   * §19/§70 — `POST /events/:id/duplicate`. Copies content (title,
   * description, media, category, rules, pricing, registration fields);
   * never copies participants, reviews, views/stats, or payment status. The
   * copy always starts as a fresh DRAFT with its own id/slug/credit.
   */
  async duplicate(eventId: string, userId: string) {
    const source = await this.eventAccess.assertPermission(eventId, userId, "EDIT_EVENT");
    const [media, registrationFields] = await Promise.all([
      this.prisma.eventMedia.findMany({ where: { eventId }, orderBy: { sortOrder: "asc" } }),
      this.prisma.registrationField.findMany({ where: { eventId }, orderBy: { sortOrder: "asc" } }),
    ]);

    const slug = await this.generateUniqueSlug(source.title);

    return this.prisma.$transaction(async (tx) => {
      const copy = await tx.event.create({
        data: {
          ownerId: source.ownerId,
          slug,
          title: source.title,
          description: source.description,
          categoryId: source.categoryId,
          language: source.language,
          format: source.format,
          cityId: source.cityId,
          districtId: source.districtId,
          addressText: source.addressText,
          addressDetails: source.addressDetails as Prisma.InputJsonValue,
          googlePlaceId: source.googlePlaceId,
          latitude: source.latitude,
          longitude: source.longitude,
          onlineUrl: source.onlineUrl,
          capacity: source.capacity,
          minParticipants: source.minParticipants,
          approvalMode: source.approvalMode,
          ageRestriction: source.ageRestriction,
          rules: source.rules,
          priceType: source.priceType,
          price: source.price,
          currency: source.currency,
          paymentUrl: source.paymentUrl,
          // Explicitly DRAFT with no publishedAt/cancelledAt/seriesId — a duplicate starts clean (§70).
        },
      });

      if (media.length > 0) {
        // References the same already-processed derivatives rather than
        // re-uploading/re-processing — they're immutable, so sharing them
        // across two events is safe.
        await tx.eventMedia.createMany({
          data: media.map((m) => ({
            eventId: copy.id,
            type: m.type,
            originalUrl: m.originalUrl,
            displayUrl: m.displayUrl,
            thumbnailUrl: m.thumbnailUrl,
            width: m.width,
            height: m.height,
            durationSeconds: m.durationSeconds,
            sortOrder: m.sortOrder,
            focalX: m.focalX,
            focalY: m.focalY,
            moderationStatus: m.moderationStatus,
          })),
        });
      }

      if (registrationFields.length > 0) {
        await tx.registrationField.createMany({
          data: registrationFields.map((f) => ({
            eventId: copy.id,
            label: f.label,
            type: f.type,
            required: f.required,
            optionsJson: f.optionsJson as Prisma.InputJsonValue,
            sortOrder: f.sortOrder,
          })),
        });
      }

      return tx.event.findUniqueOrThrow({
        where: { id: copy.id },
        include: { media: { orderBy: { sortOrder: "asc" } }, category: true, city: true, district: true },
      });
    });
  }

  /**
   * §46/§47's dashboard metrics, computed on demand rather than via a
   * separate analytics-events + daily-aggregate pipeline (that's real
   * infrastructure this MVP doesn't have yet — COUNT queries against
   * already-indexed foreign keys are cheap at current scale). `views` and
   * `conversionViewToRegistration` are omitted rather than faked: nothing
   * records page views yet.
   */
  async getStats(eventId: string, userId: string) {
    await this.eventAccess.assertPermission(eventId, userId, "VIEW_ANALYTICS");

    const [registrations, confirmed, cancellations, paymentClicks, saves] = await Promise.all([
      this.prisma.registration.count({ where: { eventId, status: { in: [...ACTIVE_REGISTRATION_STATUSES] } } }),
      this.prisma.registration.count({ where: { eventId, status: "CONFIRMED" } }),
      this.prisma.registration.count({ where: { eventId, status: "CANCELLED" } }),
      this.prisma.registration.count({ where: { eventId, paymentClickedAt: { not: null } } }),
      this.prisma.savedEvent.count({ where: { eventId } }),
    ]);

    const tracked = await this.analytics.summary(eventId);
    return {
      registrations,
      confirmed,
      cancellations,
      paymentClicks,
      saves,
      // Tracked funnel (impressions -> views -> registrations) from the daily aggregates, last 30 days.
      impressions: tracked.impressions,
      views: tracked.views,
      shares: tracked.shares,
      viewsBySource: tracked.viewsBySource,
      conversionViewToRegistration: tracked.conversionViewToRegistration,
      daily: tracked.daily,
    };
  }

  /** Owner, or someone with an active registration (§10: exact address only after registering). */
  private async canSeeExactLocation(eventId: string, ownerId: string, userId: string): Promise<boolean> {
    if (ownerId === userId) return true;
    const registration = await this.prisma.registration.findUnique({
      where: { eventId_userId: { eventId, userId } },
      select: { status: true },
    });
    return !!registration && ["REGISTERED", "PAYMENT_PENDING", "CONFIRMED", "ATTENDED"].includes(registration.status);
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

  /** §37 — this event's own rating, shown on its public page. Distinct from §38's organizer-wide aggregate (`UsersService.getPublicProfile`). */
  private async getReviewSummary(eventId: string): Promise<{ average: number | null; count: number }> {
    const result = await this.prisma.eventReview.aggregate({
      where: { eventId, status: "PUBLISHED" },
      _avg: { rating: true },
      _count: true,
    });
    return { average: result._avg.rating, count: result._count };
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

  /** §30 — the owner or a collaborator with EDIT_EVENT can edit/publish/cancel. */
  private async getOwnedEvent(eventId: string, userId: string) {
    return this.eventAccess.assertPermission(eventId, userId, "EDIT_EVENT");
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
