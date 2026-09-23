import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { ResourceNotFoundException } from "../common/exceptions/common-exceptions";
import { EVENT_CARD_INCLUDE } from "../common/utils/event-card-include";
import { FriendsService } from "../friends/friends.service";
import type { UpdateProfileDto } from "./dto/update-profile.dto";
import type { UpdateUserPreferencesDto } from "./dto/update-user-preferences.dto";

const PUBLIC_PROFILE_SELECT = {
  id: true,
  name: true,
  nickname: true,
  avatarUrl: true,
  bio: true,
  createdAt: true,
  socialLinks: { select: { type: true, url: true } },
} as const;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly friendsService: FriendsService,
  ) {}

  async getFullProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { preferences: true, socialLinks: true },
    });
    if (!user) throw new ResourceNotFoundException("User not found");

    const { passwordHash: _passwordHash, ...safe } = user;
    return safe;
  }

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: dto,
    });
    const { passwordHash: _passwordHash, ...safe } = user;
    return safe;
  }

  async updatePreferences(userId: string, dto: UpdateUserPreferencesDto) {
    return this.prisma.userPreferences.update({ where: { userId }, data: dto });
  }

  /**
   * UX §22/§23/§82 — the public profile: never phone (never public by
   * default, no toggle for it either), social links/upcoming events hidden
   * if the target opted out, plus the viewer's relationship to them so the
   * client can render "Add friend" vs "Friends" vs "Pending" correctly.
   */
  async getPublicProfile(viewerId: string | undefined, targetUserId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: targetUserId },
      select: { ...PUBLIC_PROFILE_SELECT, preferences: true },
    });
    if (!user) throw new ResourceNotFoundException("User not found");

    const relationshipStatus = await this.friendsService.getRelationshipStatus(viewerId, targetUserId);
    if (relationshipStatus === "BLOCKED_ME") {
      // The target blocked the viewer — don't reveal the profile exists any more than a 404 would.
      throw new ResourceNotFoundException("User not found");
    }

    const hideSocialLinks = user.preferences?.hideSocialLinks ?? false;
    const hideUpcomingEvents = user.preferences?.hideUpcomingEvents ?? false;

    const [friendCount, eventsCreatedCount, upcomingEvents, pastEvents, ratingSummary] = await Promise.all([
      this.prisma.friendship.count({
        where: { status: "ACCEPTED", OR: [{ requesterId: targetUserId }, { addresseeId: targetUserId }] },
      }),
      this.prisma.event.count({ where: { ownerId: targetUserId, status: "PUBLISHED" } }),
      hideUpcomingEvents
        ? Promise.resolve([])
        : this.prisma.event.findMany({
            where: { ownerId: targetUserId, status: "PUBLISHED", startsAt: { gt: new Date() } },
            orderBy: { startsAt: "asc" },
            take: 10,
            include: EVENT_CARD_INCLUDE,
          }),
      // UX §30 — "минулі події" on the organizer profile card. Same visibility
      // toggle as upcoming events: both are "events this person organizes".
      hideUpcomingEvents
        ? Promise.resolve([])
        : this.prisma.event.findMany({
            where: { ownerId: targetUserId, status: "COMPLETED" },
            orderBy: { startsAt: "desc" },
            take: 10,
            include: EVENT_CARD_INCLUDE,
          }),
      // §38 — organizer rating is never a stored/manual value, always the
      // live average of their own COMPLETED events' PUBLISHED reviews.
      this.prisma.eventReview.aggregate({
        where: { status: "PUBLISHED", event: { ownerId: targetUserId } },
        _avg: { rating: true },
        _count: true,
      }),
    ]);

    return {
      id: user.id,
      name: user.name,
      nickname: user.nickname,
      avatarUrl: user.avatarUrl,
      bio: user.bio,
      memberSince: user.createdAt,
      socialLinks: hideSocialLinks ? [] : user.socialLinks,
      friendCount,
      eventsCreatedCount,
      upcomingEvents,
      pastEvents,
      ratingAverage: ratingSummary._avg.rating,
      reviewsCount: ratingSummary._count,
      relationshipStatus,
    };
  }

  /**
   * §10 — organizer isn't a role; it's just "has created ≥1 event". Called
   * from EventsService when a user publishes their first draft (Phase 1).
   * Idempotent: only sets the timestamp once (§49 — free credits must not be
   * re-grantable via repeated activation).
   */
  async activateOrganizerIfNeeded(userId: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { organizerActivatedAt: true },
    });
    if (!user || user.organizerActivatedAt) return false;

    await this.prisma.user.update({
      where: { id: userId },
      data: { organizerActivatedAt: new Date() },
    });
    return true;
  }
}
