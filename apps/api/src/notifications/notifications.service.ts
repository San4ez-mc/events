import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PAGINATION } from "@kiro/config";
import type { CursorPage, NotificationType } from "@kiro/types";
import { PrismaService } from "../prisma/prisma.service";
import { ResourceNotFoundException, ForbiddenActionException } from "../common/exceptions/common-exceptions";
import { ExpoPushService } from "./expo-push.service";
import type { ListNotificationsDto } from "./dto/list-notifications.dto";
import type { RegisterDeviceDto } from "./dto/register-device.dto";

/** §40-41 — creates the in-app notification row + attempts delivery on every requested channel. */
@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly expoPush: ExpoPushService,
  ) {}

  /**
   * Every caller gets an IN_APP notification; PUSH is attempted too unless
   * the recipient has opted out (`allowPush`) — never EMAIL yet (§40:
   * "Future: EMAIL"). Best-effort: a push failure never throws, since a
   * notification is still meaningfully delivered via the in-app list.
   */
  async create(params: {
    userId: string;
    type: NotificationType;
    title: string;
    body: string;
    payloadJson?: Record<string, unknown>;
  }): Promise<void> {
    const notification = await this.prisma.notification.create({
      data: {
        userId: params.userId,
        type: params.type,
        title: params.title,
        body: params.body,
        payloadJson: params.payloadJson as Prisma.InputJsonValue | undefined,
      },
    });

    await this.prisma.notificationDelivery.create({
      data: { notificationId: notification.id, channel: "IN_APP", status: "SENT", sentAt: new Date() },
    });

    await this.sendPush(params.userId, notification.id, params.title, params.body, params.payloadJson);
  }

  /**
   * §32/§34 — tells everyone following the organizer (all their events, or this
   * event's category) that a new public event is out. Honours the recipient's
   * `allowSubscriptionNotifications`; never notifies the organizer themself.
   */
  async notifySubscribersOfNewEvent(eventId: string): Promise<void> {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: { id: true, slug: true, title: true, ownerId: true, categoryId: true, visibility: true, status: true },
    });
    if (!event || event.status !== "PUBLISHED" || event.visibility !== "PUBLIC") return;

    const subscriptions = await this.prisma.subscription.findMany({
      where: {
        active: true,
        organizerId: event.ownerId,
        userId: { not: event.ownerId },
        user: { preferences: { is: { allowSubscriptionNotifications: true } } },
        OR: [
          { scope: "ORGANIZER_ALL" },
          ...(event.categoryId ? [{ scope: "ORGANIZER_CATEGORY" as const, categoryId: event.categoryId }] : []),
        ],
      },
      select: { userId: true },
      distinct: ["userId"],
    });

    await Promise.all(
      subscriptions.map((s) =>
        this.create({
          userId: s.userId,
          type: "ORGANIZER_NEW_EVENT",
          title: "New event",
          body: `An organizer you follow published "${event.title}".`,
          payloadJson: { eventId: event.id, slug: event.slug },
        }).catch(() => undefined),
      ),
    );
  }

  /**
   * §34 — "your friend is going". Only when the registrant opted in to being
   * shown as a participant (privacy), and only to accepted friends who allow it.
   */
  async notifyFriendsOfRegistration(userId: string, eventId: string): Promise<void> {
    const [registration, event, user] = await Promise.all([
      this.prisma.registration.findUnique({ where: { eventId_userId: { eventId, userId } }, select: { showAsParticipant: true, status: true } }),
      this.prisma.event.findUnique({ where: { id: eventId }, select: { id: true, slug: true, title: true, status: true, visibility: true } }),
      this.prisma.user.findUnique({ where: { id: userId }, select: { name: true, nickname: true } }),
    ]);
    if (!registration?.showAsParticipant || !["REGISTERED", "CONFIRMED", "PAYMENT_PENDING"].includes(registration.status)) return;
    if (!event || event.status !== "PUBLISHED" || event.visibility !== "PUBLIC") return;

    const friendships = await this.prisma.friendship.findMany({
      where: { status: "ACCEPTED", OR: [{ requesterId: userId }, { addresseeId: userId }] },
      select: { requesterId: true, addresseeId: true },
    });
    const friendIds = friendships.map((f) => (f.requesterId === userId ? f.addresseeId : f.requesterId));
    if (friendIds.length === 0) return;

    const recipients = await this.prisma.userPreferences.findMany({
      where: { userId: { in: friendIds }, allowFriendActivityNotifications: true },
      select: { userId: true },
    });
    const who = user?.name ?? user?.nickname ?? "A friend";

    await Promise.all(
      recipients.map((r) =>
        this.create({
          userId: r.userId,
          type: "FRIEND_EVENT_REGISTERED",
          title: "Friend is going",
          body: `${who} is going to "${event.title}".`,
          payloadJson: { eventId: event.id, slug: event.slug, friendId: userId },
        }).catch(() => undefined),
      ),
    );
  }

  /** UX §7/preferences-style opt-out (`allowPush`) is checked here, not by callers. */
  private async sendPush(
    userId: string,
    notificationId: string,
    title: string,
    body: string,
    data: Record<string, unknown> | undefined,
  ): Promise<void> {
    const preferences = await this.prisma.userPreferences.findUnique({ where: { userId } });
    if (preferences && !preferences.allowPush) return;

    const devices = await this.prisma.userDevice.findMany({ where: { userId, active: true } });
    if (devices.length === 0) return;

    const results = await this.expoPush.send(
      devices.map((d) => ({ to: d.pushToken, title, body, data })),
    );

    await Promise.all(
      results.map(async (result, i) => {
        const device = devices[i]!;
        await this.prisma.notificationDelivery.create({
          data: {
            notificationId,
            channel: "PUSH",
            status: result.ok ? "SENT" : "FAILED",
            sentAt: result.ok ? new Date() : undefined,
            failedAt: result.ok ? undefined : new Date(),
            error: result.error,
          },
        });
        if (result.deviceNotRegistered) {
          await this.prisma.userDevice.update({ where: { id: device.id }, data: { active: false } });
        }
      }),
    );
  }

  async listMine(userId: string, query: ListNotificationsDto): Promise<CursorPage<unknown>> {
    const limit = Math.min(query.limit ?? PAGINATION.defaultLimit, PAGINATION.maxLimit);
    const notifications = await this.prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });

    const hasMore = notifications.length > limit;
    const items = hasMore ? notifications.slice(0, limit) : notifications;
    return { items, nextCursor: hasMore ? items[items.length - 1]!.id : null, hasMore };
  }

  async getUnreadCount(userId: string): Promise<number> {
    return this.prisma.notification.count({ where: { userId, readAt: null } });
  }

  async markRead(id: string, userId: string) {
    const notification = await this.prisma.notification.findUnique({ where: { id } });
    if (!notification) throw new ResourceNotFoundException("Notification not found");
    if (notification.userId !== userId) throw new ForbiddenActionException();
    if (notification.readAt) return notification;
    return this.prisma.notification.update({ where: { id }, data: { readAt: new Date() } });
  }

  async markAllRead(userId: string): Promise<void> {
    await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
  }

  /** Reminder/warning jobs use this to avoid sending the same one-off notification twice. */
  async existsForPayload(userId: string, type: NotificationType, payloadKey: string, payloadValue: string): Promise<boolean> {
    const existing = await this.prisma.notification.findFirst({
      where: { userId, type, payloadJson: { path: [payloadKey], equals: payloadValue } },
      select: { id: true },
    });
    return existing != null;
  }

  /**
   * §41 — upserts by (userId, pushToken): the mobile client calls this on
   * every app start, so a re-registration of the same token just refreshes
   * `lastSeenAt` and flips it back to `active` (it may have been deactivated
   * by a prior Expo push failure) rather than erroring or duplicating.
   */
  async registerDevice(userId: string, pushToken: string, platform: RegisterDeviceDto["platform"]): Promise<void> {
    await this.prisma.userDevice.upsert({
      where: { userId_pushToken: { userId, pushToken } },
      create: { userId, pushToken, platform, active: true },
      update: { active: true, lastSeenAt: new Date(), platform },
    });
  }

  /** Called on logout so a shared/reset device stops receiving this account's pushes. */
  async unregisterDevice(userId: string, pushToken: string): Promise<void> {
    await this.prisma.userDevice.updateMany({
      where: { userId, pushToken },
      data: { active: false },
    });
  }
}
