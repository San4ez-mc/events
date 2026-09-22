import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { ApiException } from "../common/exceptions/api.exception";
import { ForbiddenActionException, ResourceNotFoundException } from "../common/exceptions/common-exceptions";
import { NotificationsService } from "../notifications/notifications.service";

const PUBLIC_USER_SELECT = { id: true, name: true, nickname: true, avatarUrl: true } as const;

export type RelationshipStatus =
  | "SELF"
  | "FRIENDS"
  | "PENDING_SENT"
  | "PENDING_RECEIVED"
  | "BLOCKED_BY_ME"
  | "BLOCKED_ME"
  | "NONE";

/** §34/§35 — friend requests, friendships, and blocks. */
@Injectable()
export class FriendsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * §34 — a friend request can come from a profile, after co-registering
   * for an event, or via a shared profile link/QR (all just call this).
   * "Unique unordered pair" is enforced here, not by a DB constraint: any
   * prior row between the two users (either direction) is reused instead
   * of creating a duplicate.
   */
  async sendRequest(requesterId: string, addresseeId: string) {
    if (requesterId === addresseeId) {
      throw new ApiException("VALIDATION_ERROR", "You can't send yourself a friend request", 400);
    }
    const target = await this.prisma.user.findUnique({ where: { id: addresseeId }, select: { id: true } });
    if (!target) throw new ResourceNotFoundException("User not found");

    if (await this.isBlockedEitherWay(requesterId, addresseeId)) {
      throw new ApiException("USER_BLOCKED", "You can't send a friend request to this user", 403);
    }

    const existing = await this.prisma.friendship.findFirst({
      where: {
        OR: [
          { requesterId, addresseeId },
          { requesterId: addresseeId, addresseeId: requesterId },
        ],
      },
    });

    if (existing && (existing.status === "PENDING" || existing.status === "ACCEPTED")) {
      throw new ApiException("FRIEND_REQUEST_ALREADY_EXISTS", "A friend request or friendship already exists", 409);
    }

    const friendship = existing
      ? await this.prisma.friendship.update({
          where: { id: existing.id },
          data: { requesterId, addresseeId, status: "PENDING", respondedAt: null, createdAt: new Date() },
        })
      : await this.prisma.friendship.create({ data: { requesterId, addresseeId } });

    const requester = await this.prisma.user.findUnique({ where: { id: requesterId }, select: { name: true, nickname: true } });
    await this.notifications.create({
      userId: addresseeId,
      type: "FRIEND_REQUEST",
      title: "New friend request",
      body: `${requester?.name ?? requester?.nickname ?? "Someone"} wants to be friends.`,
      payloadJson: { friendshipId: friendship.id },
    });

    return friendship;
  }

  async accept(friendshipId: string, userId: string) {
    const friendship = await this.getPendingAddressedToMe(friendshipId, userId);
    const updated = await this.prisma.friendship.update({
      where: { id: friendshipId },
      data: { status: "ACCEPTED", respondedAt: new Date() },
    });
    const addressee = await this.prisma.user.findUnique({ where: { id: userId }, select: { name: true, nickname: true } });
    await this.notifications.create({
      userId: friendship.requesterId,
      type: "FRIEND_ACCEPTED",
      title: "Friend request accepted",
      body: `${addressee?.name ?? addressee?.nickname ?? "Someone"} accepted your friend request.`,
      payloadJson: { friendshipId },
    });
    return updated;
  }

  async reject(friendshipId: string, userId: string) {
    await this.getPendingAddressedToMe(friendshipId, userId);
    return this.prisma.friendship.update({
      where: { id: friendshipId },
      data: { status: "REJECTED", respondedAt: new Date() },
    });
  }

  /** Requester withdraws their own not-yet-answered request. */
  async cancel(friendshipId: string, userId: string) {
    const friendship = await this.prisma.friendship.findUnique({ where: { id: friendshipId } });
    if (!friendship) throw new ResourceNotFoundException("Friend request not found");
    if (friendship.requesterId !== userId) throw new ForbiddenActionException();
    if (friendship.status !== "PENDING") {
      throw new ApiException("VALIDATION_ERROR", "Only a pending request can be cancelled", 400);
    }
    return this.prisma.friendship.update({
      where: { id: friendshipId },
      data: { status: "CANCELLED", respondedAt: new Date() },
    });
  }

  /** Either side can end an accepted friendship; the row is deleted so a fresh request later starts clean. */
  async unfriend(friendshipId: string, userId: string): Promise<void> {
    const friendship = await this.prisma.friendship.findUnique({ where: { id: friendshipId } });
    if (!friendship) throw new ResourceNotFoundException("Friendship not found");
    if (friendship.requesterId !== userId && friendship.addresseeId !== userId) throw new ForbiddenActionException();
    if (friendship.status !== "ACCEPTED") {
      throw new ApiException("VALIDATION_ERROR", "You're not friends with this user", 400);
    }
    await this.prisma.friendship.delete({ where: { id: friendshipId } });
  }

  /** Lighter than `listFriends` — just the ids, e.g. for "N friends are going" on an event page (§34's "friend event status"). */
  async getFriendIds(userId: string): Promise<string[]> {
    const friendships = await this.prisma.friendship.findMany({
      where: { status: "ACCEPTED", OR: [{ requesterId: userId }, { addresseeId: userId }] },
      select: { requesterId: true, addresseeId: true },
    });
    return friendships.map((f) => (f.requesterId === userId ? f.addresseeId : f.requesterId));
  }

  async listFriends(userId: string) {
    const friendships = await this.prisma.friendship.findMany({
      where: { status: "ACCEPTED", OR: [{ requesterId: userId }, { addresseeId: userId }] },
      include: { requester: { select: PUBLIC_USER_SELECT }, addressee: { select: PUBLIC_USER_SELECT } },
      orderBy: { respondedAt: "desc" },
    });
    return friendships.map((f) => (f.requesterId === userId ? f.addressee : f.requester));
  }

  async listIncomingRequests(userId: string) {
    return this.prisma.friendship.findMany({
      where: { addresseeId: userId, status: "PENDING" },
      include: { requester: { select: PUBLIC_USER_SELECT } },
      orderBy: { createdAt: "desc" },
    });
  }

  async listOutgoingRequests(userId: string) {
    return this.prisma.friendship.findMany({
      where: { requesterId: userId, status: "PENDING" },
      include: { addressee: { select: PUBLIC_USER_SELECT } },
      orderBy: { createdAt: "desc" },
    });
  }

  /** §35 — blocking also severs any existing/pending friendship between the two. */
  async block(blockerId: string, blockedUserId: string): Promise<void> {
    if (blockerId === blockedUserId) throw new ApiException("VALIDATION_ERROR", "You can't block yourself", 400);
    const target = await this.prisma.user.findUnique({ where: { id: blockedUserId }, select: { id: true } });
    if (!target) throw new ResourceNotFoundException("User not found");

    await this.prisma.$transaction([
      this.prisma.userBlock.upsert({
        where: { blockerId_blockedUserId: { blockerId, blockedUserId } },
        create: { blockerId, blockedUserId },
        update: {},
      }),
      this.prisma.friendship.updateMany({
        where: {
          status: { in: ["PENDING", "ACCEPTED"] },
          OR: [
            { requesterId: blockerId, addresseeId: blockedUserId },
            { requesterId: blockedUserId, addresseeId: blockerId },
          ],
        },
        data: { status: "CANCELLED", respondedAt: new Date() },
      }),
    ]);
  }

  async unblock(blockerId: string, blockedUserId: string): Promise<void> {
    await this.prisma.userBlock.deleteMany({ where: { blockerId, blockedUserId } });
  }

  async listBlocked(userId: string) {
    const blocks = await this.prisma.userBlock.findMany({
      where: { blockerId: userId },
      include: { blockedUser: { select: PUBLIC_USER_SELECT } },
      orderBy: { createdAt: "desc" },
    });
    return blocks.map((b) => b.blockedUser);
  }

  async getRelationshipStatus(viewerId: string | undefined, targetUserId: string): Promise<RelationshipStatus> {
    if (!viewerId) return "NONE";
    if (viewerId === targetUserId) return "SELF";

    const block = await this.prisma.userBlock.findFirst({
      where: { OR: [{ blockerId: viewerId, blockedUserId: targetUserId }, { blockerId: targetUserId, blockedUserId: viewerId }] },
    });
    if (block) return block.blockerId === viewerId ? "BLOCKED_BY_ME" : "BLOCKED_ME";

    const friendship = await this.prisma.friendship.findFirst({
      where: {
        OR: [
          { requesterId: viewerId, addresseeId: targetUserId },
          { requesterId: targetUserId, addresseeId: viewerId },
        ],
      },
    });
    if (!friendship || friendship.status === "REJECTED" || friendship.status === "CANCELLED") return "NONE";
    if (friendship.status === "ACCEPTED") return "FRIENDS";
    return friendship.requesterId === viewerId ? "PENDING_SENT" : "PENDING_RECEIVED";
  }

  /** Used by UsersService's public profile and future friends-only visibility checks. */
  async areFriends(userIdA: string, userIdB: string): Promise<boolean> {
    const friendship = await this.prisma.friendship.findFirst({
      where: {
        status: "ACCEPTED",
        OR: [
          { requesterId: userIdA, addresseeId: userIdB },
          { requesterId: userIdB, addresseeId: userIdA },
        ],
      },
      select: { id: true },
    });
    return friendship != null;
  }

  private async isBlockedEitherWay(userIdA: string, userIdB: string): Promise<boolean> {
    const block = await this.prisma.userBlock.findFirst({
      where: { OR: [{ blockerId: userIdA, blockedUserId: userIdB }, { blockerId: userIdB, blockedUserId: userIdA }] },
    });
    return block != null;
  }

  private async getPendingAddressedToMe(friendshipId: string, userId: string) {
    const friendship = await this.prisma.friendship.findUnique({ where: { id: friendshipId } });
    if (!friendship) throw new ResourceNotFoundException("Friend request not found");
    if (friendship.addresseeId !== userId) throw new ForbiddenActionException();
    if (friendship.status !== "PENDING") {
      throw new ApiException("VALIDATION_ERROR", "This request is no longer pending", 400);
    }
    return friendship;
  }
}
