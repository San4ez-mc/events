import { Injectable } from "@nestjs/common";
import sharp from "sharp";
import type { UserRole, UserStatus } from "@kiro/types";
import { PAGINATION } from "@kiro/config";
import type { CursorPage } from "@kiro/types";
import { PrismaService } from "../prisma/prisma.service";
import { ApiException } from "../common/exceptions/api.exception";
import { ResourceNotFoundException } from "../common/exceptions/common-exceptions";
import { EVENT_CARD_INCLUDE } from "../common/utils/event-card-include";
import { FriendsService } from "../friends/friends.service";
import { AuditLogService } from "../audit/audit-log.service";
import { StorageService } from "../storage/storage.service";
import type { UpdateProfileDto } from "./dto/update-profile.dto";
import type { SetSocialLinksDto } from "./dto/set-social-links.dto";
import type { UpdateUserPreferencesDto } from "./dto/update-user-preferences.dto";
import type { AdminListUsersDto } from "./dto/admin-list-users.dto";

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
    private readonly auditLog: AuditLogService,
    private readonly storage: StorageService,
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
      // A changed number is no longer verified.
      data: {
        ...dto,
        birthDate: dto.birthDate ? new Date(dto.birthDate) : undefined,
        ...(dto.phone !== undefined ? { phoneVerifiedAt: null } : {}),
      },
    });
    const { passwordHash: _passwordHash, ...safe } = user;
    return safe;
  }

  /** Square 512px JPEG, re-encoded so EXIF/GPS metadata is dropped (§23). */
  async uploadAvatar(userId: string, file: Express.Multer.File) {
    if (!file.mimetype.startsWith("image/")) {
      throw new ApiException("VALIDATION_ERROR", "Avatar must be an image", 400, { file: ["Not an image"] });
    }
    let buffer: Buffer;
    try {
      buffer = await sharp(file.buffer, { failOn: "none" })
        .rotate()
        .resize(512, 512, { fit: "cover" })
        .jpeg({ quality: 85 })
        .toBuffer();
    } catch {
      throw new ApiException("VALIDATION_ERROR", "Unreadable image", 400, { file: ["Unreadable image"] });
    }
    const { url } = await this.storage.putObject(`avatars/${userId}/${Date.now()}.jpg`, buffer, "image/jpeg");
    await this.prisma.user.update({ where: { id: userId }, data: { avatarUrl: url } });
    return { avatarUrl: url };
  }

  async setSocialLinks(userId: string, dto: SetSocialLinksDto) {
    await this.prisma.$transaction([
      this.prisma.userSocialLink.deleteMany({ where: { userId } }),
      this.prisma.userSocialLink.createMany({ data: dto.links.map((l) => ({ userId, type: l.type, url: l.url })) }),
    ]);
    return this.prisma.userSocialLink.findMany({ where: { userId }, select: { type: true, url: true }, orderBy: { createdAt: "asc" } });
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

  /** Phase 10's `/admin/users` — search by name/nickname/email, filter by role/status. */
  async adminList(query: AdminListUsersDto): Promise<CursorPage<unknown>> {
    const limit = Math.min(query.limit ?? PAGINATION.defaultLimit, PAGINATION.maxLimit);
    const users = await this.prisma.user.findMany({
      where: {
        role: query.role,
        status: query.status,
        ...(query.search
          ? {
              OR: [
                { name: { contains: query.search, mode: "insensitive" } },
                { nickname: { contains: query.search, mode: "insensitive" } },
                { email: { contains: query.search, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      orderBy: { createdAt: "desc" },
      take: limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      select: {
        id: true,
        email: true,
        name: true,
        nickname: true,
        avatarUrl: true,
        role: true,
        status: true,
        createdAt: true,
        organizerActivatedAt: true,
      },
    });

    const hasMore = users.length > limit;
    const items = hasMore ? users.slice(0, limit) : users;
    return { items, nextCursor: hasMore ? (items[items.length - 1] as { id: string }).id : null, hasMore };
  }

  async adminGetOne(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        nickname: true,
        avatarUrl: true,
        role: true,
        status: true,
        createdAt: true,
        organizerActivatedAt: true,
        lastLoginAt: true,
      },
    });
    if (!user) throw new ResourceNotFoundException("User not found");

    const [eventsCount, registrationsCount] = await Promise.all([
      this.prisma.event.count({ where: { ownerId: userId } }),
      this.prisma.registration.count({ where: { userId } }),
    ]);

    return { ...user, eventsCount, registrationsCount };
  }

  /** Suspend/unsuspend/block — not a role change, so ADMIN (not just SUPER_ADMIN) can do this (§73). */
  async adminSetStatus(adminId: string, userId: string, status: UserStatus): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { status: true } });
    if (!user) throw new ResourceNotFoundException("User not found");

    await this.prisma.user.update({ where: { id: userId }, data: { status } });
    await this.auditLog.record({
      actorUserId: adminId,
      action: "USER_STATUS_CHANGE",
      entityType: "User",
      entityId: userId,
      before: { status: user.status },
      after: { status },
    });
  }

  /** Role changes are SUPER_ADMIN-only (§73) — enforced at the controller, not repeated here. */
  async adminSetRole(adminId: string, userId: string, role: UserRole): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
    if (!user) throw new ResourceNotFoundException("User not found");
    if (userId === adminId && role !== "SUPER_ADMIN") {
      throw new ApiException("VALIDATION_ERROR", "You can't demote your own account", 400);
    }

    await this.prisma.user.update({ where: { id: userId }, data: { role } });
    await this.auditLog.record({
      actorUserId: adminId,
      action: "USER_ROLE_CHANGE",
      entityType: "User",
      entityId: userId,
      before: { role: user.role },
      after: { role },
    });
  }
}
