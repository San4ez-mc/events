import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PAGINATION } from "@kiro/config";
import type { CursorPage, NotificationType } from "@kiro/types";
import { PrismaService } from "../prisma/prisma.service";
import { ResourceNotFoundException, ForbiddenActionException } from "../common/exceptions/common-exceptions";
import { ExpoPushService } from "./expo-push.service";
import type { ListNotificationsDto } from "./dto/list-notifications.dto";

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
}
