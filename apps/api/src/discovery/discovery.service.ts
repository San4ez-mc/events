import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { DISCOVERY_RANKING_WEIGHTS, PAGINATION } from "@kiro/config";
import { SYSTEM_SETTING_DEFAULTS, SystemSettingKey } from "@kiro/types";
import type { CursorPage, CursorPageQuery } from "@kiro/types";
import { PrismaService } from "../prisma/prisma.service";
import { ResourceNotFoundException } from "../common/exceptions/common-exceptions";
import { decodeScoredCursor, encodeScoredCursor, sliceAfterScoredCursor } from "../common/utils/scored-cursor";
import { buildPublicEventWhere } from "../common/utils/public-event-filters";
import { EVENT_CARD_INCLUDE, type EventCard } from "../common/utils/event-card-include";
import { AnalyticsService } from "../analytics/analytics.service";
import { SocialProofService, type SocialProof } from "../common/social-proof/social-proof.service";
import type { DiscoveryQueryDto } from "./dto/discovery-query.dto";
import type { RecordInteractionDto } from "./dto/record-interaction.dto";
import type { UpdateDiscoveryPreferencesDto } from "./dto/update-discovery-preferences.dto";

/**
 * A day in milliseconds, used throughout the ranking/cooldown math below.
 */
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Safety valve on how many published events are pulled into memory to be
 * scored per request (§58 — deterministic rule-based ranking, computed in
 * application code, not stored). Fine at Kiro's current single-city-cluster
 * MVP scale; a later phase would need to push scoring into SQL (or a search
 * index) once the candidate set regularly exceeds this.
 */
const DISCOVERY_CANDIDATE_CAP = 500;

@Injectable()
export class DiscoveryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly socialProof: SocialProofService,
    private readonly analytics: AnalyticsService,
  ) {}

  /** §57/§58 — ranked, filtered, cursor-paginated discovery feed. */
  async getFeed(userId: string | undefined, query: DiscoveryQueryDto): Promise<CursorPage<EventCard & { social: SocialProof }>> {
    const limit = Math.min(query.limit ?? PAGINATION.defaultLimit, PAGINATION.maxLimit);
    const cursor = query.cursor ? decodeScoredCursor(query.cursor) : null;

    const [excludedEventIds, preferences] = await Promise.all([
      this.getRecentlyPassedEventIds(userId),
      userId ? this.prisma.userPreferences.findUnique({ where: { userId } }) : null,
    ]);

    const now = new Date();
    const viewer = userId ? await this.prisma.user.findUnique({ where: { id: userId }, select: { birthDate: true } }) : null;
    const isMinor = !!viewer?.birthDate && this.ageOn(viewer.birthDate, now) < 18;
    const candidates = await this.prisma.event.findMany({
      where: { ...this.buildFeedWhere(query, excludedEventIds, now), ...(isMinor ? { OR: [{ ageRestriction: null }, { ageRestriction: { lt: 18 } }] } : {}) },
      orderBy: { startsAt: "asc" },
      take: DISCOVERY_CANDIDATE_CAP,
      include: EVENT_CARD_INCLUDE,
    });

    const scored = candidates
      .filter((event) => this.startsInHourWindow(event.startsAt, query.hourFrom, query.hourTo, event.timezone))
      .map((event) => ({ ...event, score: this.scoreEvent(event, preferences, now) }))
      .sort((a, b) => (b.score !== a.score ? b.score - a.score : a.id.localeCompare(b.id)));

    const sliced = sliceAfterScoredCursor(scored, cursor);
    const hasMore = sliced.length > limit;
    const page = hasMore ? sliced.slice(0, limit) : sliced;
    const last = page[page.length - 1];

    return {
      items: await this.socialProof.attach(
        page.map(({ score: _score, ...event }) => event),
        userId,
      ),
      nextCursor: hasMore && last ? encodeScoredCursor(last.score, last.id) : null,
      hasMore,
    };
  }

  /** §59 — records a swipe-left (PASS) or swipe-right/tap (OPEN). */
  async recordInteraction(userId: string, eventId: string, dto: RecordInteractionDto): Promise<void> {
    const event = await this.prisma.event.findUnique({ where: { id: eventId }, select: { id: true } });
    if (!event) throw new ResourceNotFoundException("Event not found");

    await this.prisma.eventInteraction.create({
      data: { userId, eventId, interaction: dto.interaction },
    });
  }

  /** UX §5 — save is not a registration. Idempotent: saving twice is a no-op. */
  async saveEvent(userId: string, eventId: string): Promise<void> {
    const event = await this.prisma.event.findUnique({ where: { id: eventId }, select: { id: true } });
    if (!event) throw new ResourceNotFoundException("Event not found");

    await this.prisma.savedEvent.upsert({
      where: { userId_eventId: { userId, eventId } },
      create: { userId, eventId },
      update: {},
    });
    this.analytics.record({ eventId, userId, action: "SAVE" });
  }

  async unsaveEvent(userId: string, eventId: string): Promise<void> {
    await this.prisma.savedEvent.deleteMany({ where: { userId, eventId } });
    this.analytics.record({ eventId, userId, action: "UNSAVE" });
  }

  /** "Мої → Збережені" (UX §5). */
  async listSaved(userId: string, query: CursorPageQuery): Promise<CursorPage<EventCard & { social: SocialProof }>> {
    const limit = Math.min(query.limit ?? PAGINATION.defaultLimit, PAGINATION.maxLimit);

    const saved = await this.prisma.savedEvent.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      include: { event: { include: EVENT_CARD_INCLUDE } },
    });

    const hasMore = saved.length > limit;
    const page = hasMore ? saved.slice(0, limit) : saved;

    return {
      items: await this.socialProof.attach(
        page.map((s) => s.event),
        userId,
      ),
      nextCursor: hasMore ? page[page.length - 1]!.id : null,
      hasMore,
    };
  }

  async getPreferences(userId: string) {
    const preferences = await this.prisma.userPreferences.findUnique({ where: { userId } });
    if (!preferences) throw new ResourceNotFoundException("Preferences not found");
    return preferences;
  }

  async updatePreferences(userId: string, dto: UpdateDiscoveryPreferencesDto) {
    return this.prisma.userPreferences.update({ where: { userId }, data: dto });
  }

  /** §7 "Час": ranges like morning/day/evening/night. Evaluated in the event timezone; from > to wraps past midnight. */
  private startsInHourWindow(startsAt: Date | null, from: number | undefined, to: number | undefined, timezone: string): boolean {
    if (from == null || to == null || !startsAt) return true;
    const hour = Number(
      new Intl.DateTimeFormat("en-GB", { hour: "numeric", hourCycle: "h23", timeZone: timezone || "Europe/Kyiv" }).format(startsAt),
    );
    return from <= to ? hour >= from && hour < to : hour >= from || hour < to;
  }

  private ageOn(birthDate: Date, on: Date): number {
    let age = on.getUTCFullYear() - birthDate.getUTCFullYear();
    const beforeBirthday = on.getUTCMonth() < birthDate.getUTCMonth() || (on.getUTCMonth() === birthDate.getUTCMonth() && on.getUTCDate() < birthDate.getUTCDate());
    if (beforeBirthday) age -= 1;
    return age;
  }

  private buildFeedWhere(
    query: DiscoveryQueryDto,
    excludedEventIds: string[],
    now: Date,
  ): Prisma.EventWhereInput {
    return {
      ...buildPublicEventWhere(query, now),
      id: excludedEventIds.length ? { notIn: excludedEventIds } : undefined,
    };
  }

  /**
   * §58 — deterministic rule-based score, weights from `@kiro/config`
   * (never hardcoded ML). "preferred X" bonuses come from the user's saved
   * defaults (`UserPreferences`), not from the request's own filter params —
   * a hard filter already guarantees 100% of results match it, so scoring
   * against the *same* params would be a no-op; scoring against the user's
   * standing profile preferences lets an unfiltered feed still be relevant.
   *
   * Popularity and availability (§58) need registration counts, which don't
   * exist until Phase 4 (registrations) — both contribute 0 for now.
   */
  private scoreEvent(
    event: Pick<EventCard, "cityId" | "districtId" | "categoryId" | "startsAt" | "createdAt">,
    preferences: { preferredCityId: string | null; preferredDistrictIds: string[]; preferredCategoryIds: string[] } | null,
    now: Date,
  ): number {
    let score = 0;

    if (preferences?.preferredCityId && event.cityId === preferences.preferredCityId) {
      score += DISCOVERY_RANKING_WEIGHTS.preferredCity;
    }
    if (event.districtId && preferences?.preferredDistrictIds.includes(event.districtId)) {
      score += DISCOVERY_RANKING_WEIGHTS.preferredDistrict;
    }
    if (event.categoryId && preferences?.preferredCategoryIds.includes(event.categoryId)) {
      score += DISCOVERY_RANKING_WEIGHTS.preferredCategory;
    }
    if (event.startsAt) {
      const daysUntil = Math.max(0, (event.startsAt.getTime() - now.getTime()) / DAY_MS);
      score += Math.max(0, DISCOVERY_RANKING_WEIGHTS.dateProximityMax - daysUntil);
    }
    const daysSinceCreated = Math.max(0, (now.getTime() - event.createdAt.getTime()) / DAY_MS);
    score += Math.max(0, DISCOVERY_RANKING_WEIGHTS.freshEventMax - daysSinceCreated);

    return score;
  }

  private async getRecentlyPassedEventIds(userId: string | undefined): Promise<string[]> {
    if (!userId) return [];

    const cooldownDays = await this.getFeedPassCooldownDays();
    const cutoff = new Date(Date.now() - cooldownDays * DAY_MS);

    const passes = await this.prisma.eventInteraction.findMany({
      where: { userId, interaction: "PASS", createdAt: { gte: cutoff } },
      select: { eventId: true },
      distinct: ["eventId"],
    });
    return passes.map((p) => p.eventId);
  }

  private async getFeedPassCooldownDays(): Promise<number> {
    const setting = await this.prisma.systemSetting.findUnique({
      where: { key: SystemSettingKey.FEED_PASS_COOLDOWN_DAYS },
    });
    const value = setting?.valueJson;
    return typeof value === "number"
      ? value
      : (SYSTEM_SETTING_DEFAULTS[SystemSettingKey.FEED_PASS_COOLDOWN_DAYS] as number);
  }
}
