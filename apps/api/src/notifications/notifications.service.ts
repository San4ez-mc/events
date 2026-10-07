import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PAGINATION } from "@kiro/config";
import type { CursorPage, NotificationType } from "@kiro/types";
import { PrismaService } from "../prisma/prisma.service";
import { ResourceNotFoundException, ForbiddenActionException } from "../common/exceptions/common-exceptions";
import { ExpoPushService } from "./expo-push.service";
import { localizeNotification } from "./notification-i18n";
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
    const recipient = await this.prisma.user.findUnique({ where: { id: params.userId }, select: { locale: true } });
    const text = localizeNotification(recipient?.locale, params.title, params.body);

    // Most callers only pass { eventId }; the clients open an event by slug (GET /events/:id is owner-only),
    // so a tap on those notifications silently did nothing. Resolve the slug once here for every caller.
    const eventId = params.payloadJson?.eventId;
    if (typeof eventId === "string" && params.payloadJson?.slug === undefined) {
      const ev = await this.prisma.event.findUnique({ where: { id: eventId }, select: { slug: true } });
      if (ev) params = { ...params, payloadJson: { ...params.payloadJson, slug: ev.slug } };
    }
    const notification = await this.prisma.notification.create({
      data: {
        userId: params.userId,
        type: params.type,
        title: text.title,
        body: text.body,
        payloadJson: params.payloadJson as Prisma.InputJsonValue | undefined,
      },
    });

    await this.prisma.notificationDelivery.create({
      data: { notificationId: notification.id, channel: "IN_APP", status: "SENT", sentAt: new Date() },
    });

    await this.sendPush(params.userId, notification.id, text.title, text.body, params.payloadJson);
  }

  /**
   * Heads-up for staff when something needs their decision (a new report, a category awaiting approval, an event held
   * for moderation...). Goes through create(), so each gets the in-app row and a push. Best-effort: a failure here must
   * never break the user action that triggered it, so errors are swallowed per recipient.
   */
  async notifyStaff(params: {
    roles: ("MODERATOR" | "ADMIN" | "SUPER_ADMIN")[];
    title: string;
    body: string;
    /** Where tapping it should land in the admin screen (the app opens /admin on this tab). */
    adminTab: string;
    excludeUserId?: string;
  }): Promise<void> {
    const staff = await this.prisma.user.findMany({
      where: { role: { in: params.roles }, status: "ACTIVE", ...(params.excludeUserId ? { id: { not: params.excludeUserId } } : {}) },
      select: { id: true },
    });
    await Promise.all(
      staff.map((u) =>
        this.create({ userId: u.id, type: "MODERATION_UPDATE", title: params.title, body: params.body, payloadJson: { adminTab: params.adminTab } }).catch(() => undefined),
      ),
    );
  }

  /**
   * §40 (UX) — a manual announcement to every ACTIVE user (suspended/blocked/deleted accounts are skipped).
   * Goes through create(), so each recipient still gets the in-app row and a push unless they opted out of
   * push. Walks users in id-ordered pages so it never loads the whole table, and sends a handful at a time
   * so a big audience can't exhaust the DB pool. Returns how many people it reached.
   */
  async broadcast(text: { title: string; body: string; titleEn?: string; bodyEn?: string }): Promise<number> {
    const PAGE = 200;
    const PARALLEL = 10;
    let cursor: string | undefined;
    let sent = 0;
    for (;;) {
      const users = await this.prisma.user.findMany({
        where: { status: "ACTIVE" },
        select: { id: true, locale: true },
        orderBy: { id: "asc" },
        take: PAGE,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      });
      if (users.length === 0) break;
      for (let i = 0; i < users.length; i += PARALLEL) {
        await Promise.all(
          users.slice(i, i + PARALLEL).map((u) => {
            const english = u.locale === "en" && text.titleEn && text.bodyEn;
            return this.create({
              userId: u.id,
              type: "ADMIN_BROADCAST",
              title: english ? text.titleEn! : text.title,
              body: english ? text.bodyEn! : text.body,
            });
          }),
        );
      }
      sent += users.length;
      cursor = users[users.length - 1]!.id;
      if (users.length < PAGE) break;
    }
    return sent;
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

  /** "Your friend is going" for an event registered elsewhere ("Я піду"): same privacy rules as a registration. */
  async notifyFriendsOfGoing(userId: string, eventId: string): Promise<void> {
    const [event, user] = await Promise.all([
      this.prisma.event.findUnique({ where: { id: eventId }, select: { id: true, slug: true, title: true, status: true, visibility: true } }),
      this.prisma.user.findUnique({ where: { id: userId }, select: { name: true, nickname: true } }),
    ]);
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
      devices.map((d) => ({ to: d.pushToken, title, body, data: { ...data, notificationId } })),
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

  async deleteAll(userId: string): Promise<void> {
    await this.prisma.notification.deleteMany({ where: { userId } });
  }

  /** Called when a signed-in user opens an event page. Idempotent; never throws into the request. */
  recordEventInterest(userId: string, eventId: string): void {
    void this.prisma.eventInterest
      .upsert({ where: { userId_eventId: { userId, eventId } }, create: { userId, eventId }, update: {} })
      .catch(() => undefined);
  }

  /**
   * People who showed interest in an event without registering: liked (saved) it, follow it, or opened it.
   * Merely scrolling past a card in the feed counts for nothing. The organizer is never included.
   */
  async getInterestedUserIds(eventId: string, ownerId?: string): Promise<string[]> {
    const [saved, followed, opened, swipedIn, going] = await Promise.all([
      this.prisma.savedEvent.findMany({ where: { eventId }, select: { userId: true } }),
      this.prisma.subscription.findMany({ where: { scope: "EVENT", eventId, active: true }, select: { userId: true } }),
      this.prisma.eventInterest.findMany({ where: { eventId }, select: { userId: true } }),
      // A swipe-right / tap on the card in the feed (a PASS swipe means "not interested" and is ignored).
      this.prisma.eventInteraction.findMany({ where: { eventId, interaction: "OPEN" }, select: { userId: true } }),
      this.prisma.eventIntent.findMany({ where: { eventId }, select: { userId: true } }),
    ]);
    const ids = new Set([...saved, ...followed, ...opened, ...swipedIn, ...going].map((r) => r.userId));
    if (ownerId) ids.delete(ownerId);
    return [...ids];
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
