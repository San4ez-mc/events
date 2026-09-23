import { Injectable } from "@nestjs/common";
import { PAGINATION } from "@kiro/config";
import type { CursorPage } from "@kiro/types";
import { REVIEW_ELIGIBLE_REGISTRATION_STATUSES, SYSTEM_SETTING_DEFAULTS, SystemSettingKey } from "@kiro/types";
import { PrismaService } from "../prisma/prisma.service";
import { ApiException } from "../common/exceptions/api.exception";
import { ForbiddenActionException, ResourceNotFoundException } from "../common/exceptions/common-exceptions";
import type { CreateReviewDto } from "./dto/create-review.dto";
import type { ListReviewsDto } from "./dto/list-reviews.dto";

const REVIEW_AUTHOR_INCLUDE = {
  author: { select: { id: true, name: true, nickname: true, avatarUrl: true } },
} as const;

/**
 * §37/§38/§81 — post-event reviews. Eligibility is always re-checked here,
 * never trusted from the client (§81: "Do not rely on UI hidden state").
 * The organizer's aggregate rating (§38) is intentionally not cached — see
 * the doc-comment on `EventReview` in schema.prisma.
 */
@Injectable()
export class ReviewsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Create-or-update: a second review from the same author replaces the first, never duplicates (unique eventId+authorUserId). */
  async upsert(eventId: string, authorUserId: string, dto: CreateReviewDto) {
    const event = await this.prisma.event.findUnique({ where: { id: eventId } });
    if (!event) throw new ResourceNotFoundException("Event not found");

    if (event.ownerId === authorUserId) {
      throw new ApiException("VALIDATION_ERROR", "You can't review your own event", 400);
    }
    if (event.status !== "COMPLETED") {
      throw new ApiException("VALIDATION_ERROR", "This event hasn't completed yet", 400);
    }

    const registration = await this.prisma.registration.findUnique({
      where: { eventId_userId: { eventId, userId: authorUserId } },
    });
    if (!registration || !REVIEW_ELIGIBLE_REGISTRATION_STATUSES.includes(registration.status)) {
      throw new ForbiddenActionException("You need to have attended this event to review it");
    }

    const windowDays = await this.getReviewWindowDays();
    const deadline = event.completedAt ? new Date(event.completedAt.getTime() + windowDays * 86_400_000) : null;
    if (deadline && new Date() > deadline) {
      throw new ApiException("VALIDATION_ERROR", "The review window for this event has closed", 400);
    }

    return this.prisma.eventReview.upsert({
      where: { eventId_authorUserId: { eventId, authorUserId } },
      create: { eventId, authorUserId, rating: dto.rating, text: dto.text },
      update: { rating: dto.rating, text: dto.text },
      include: REVIEW_AUTHOR_INCLUDE,
    });
  }

  async listForEvent(eventId: string, query: ListReviewsDto): Promise<CursorPage<unknown>> {
    const limit = Math.min(query.limit ?? PAGINATION.defaultLimit, PAGINATION.maxLimit);
    const reviews = await this.prisma.eventReview.findMany({
      where: { eventId, status: "PUBLISHED" },
      orderBy: { createdAt: "desc" },
      take: limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      include: REVIEW_AUTHOR_INCLUDE,
    });

    const hasMore = reviews.length > limit;
    const items = hasMore ? reviews.slice(0, limit) : reviews;
    return { items, nextCursor: hasMore ? items[items.length - 1]!.id : null, hasMore };
  }

  /** Author-only retraction. There's no organizer-side hide here — that's Phase 10's moderation surface (`ReviewStatus.HIDDEN`/`REMOVED`). */
  async remove(reviewId: string, userId: string): Promise<void> {
    const review = await this.prisma.eventReview.findUnique({ where: { id: reviewId } });
    if (!review) throw new ResourceNotFoundException("Review not found");
    if (review.authorUserId !== userId) throw new ForbiddenActionException();
    await this.prisma.eventReview.delete({ where: { id: reviewId } });
  }

  private async getReviewWindowDays(): Promise<number> {
    const setting = await this.prisma.systemSetting.findUnique({
      where: { key: SystemSettingKey.REVIEW_WINDOW_DAYS },
    });
    const value = setting?.valueJson;
    return typeof value === "number" ? value : (SYSTEM_SETTING_DEFAULTS[SystemSettingKey.REVIEW_WINDOW_DAYS] as number);
  }
}
