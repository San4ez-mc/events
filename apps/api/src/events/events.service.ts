import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PAGINATION } from "@kiro/config";
import type { CursorPage } from "@kiro/types";
import { PrismaService } from "../prisma/prisma.service";
import { UsersService } from "../users/users.service";
import { ApiException } from "../common/exceptions/api.exception";
import { ForbiddenActionException, ResourceNotFoundException } from "../common/exceptions/common-exceptions";
import { slugifyUnique } from "../common/utils/slugify";
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
      include: { media: true },
    });
  }

  async update(eventId: string, userId: string, dto: UpdateEventDto) {
    const event = await this.getOwnedEvent(eventId, userId);

    if (event.status === "PUBLISHED") {
      const touchesSignificantField = SIGNIFICANT_PUBLISHED_FIELDS.some(
        (field) => (dto as Record<string, unknown>)[field] !== undefined,
      );
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
      include: { media: true },
    });

    // TODO(Phase 5): if touchesSignificantField, enqueue event.changed
    // notifications to all registered participants instead of just allowing
    // the write through once confirmed.

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
    return this.getOwnedEvent(eventId, userId);
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
      include: { media: { orderBy: { sortOrder: "asc" } }, category: true, city: true, district: true },
    });
    if (!event) throw new ResourceNotFoundException("Event not found");

    if (event.status !== "PUBLISHED" && event.ownerId !== requesterId) {
      // Deliberately the same NOT_FOUND as a missing event — don't leak the
      // existence of someone else's draft via a 403 (§10: never trust the
      // frontend to hide this; the backend must actively refuse to reveal it).
      throw new ResourceNotFoundException("Event not found");
    }

    return event;
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
