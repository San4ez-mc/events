import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { SYSTEM_SETTING_DEFAULTS, SystemSettingKey } from "@kiro/types";
import { PrismaService } from "../prisma/prisma.service";
import { ACTIVE_REGISTRATION_STATUSES } from "../common/constants/registration-active-statuses";
import { NotificationsService } from "./notifications.service";

/** Which reminder hour (from `system_settings.defaultReminderHours`) maps to which fixed enum slot (§43's MVP defaults). */
const REMINDER_TYPE_BY_HOUR: Record<number, "EVENT_REMINDER_24H" | "EVENT_REMINDER_1H"> = {
  24: "EVENT_REMINDER_24H",
  1: "EVENT_REMINDER_1H",
};

/**
 * §42/§43/§80 — the background jobs that don't have a specific user action
 * triggering them: event reminders, auto-completing finished events, and
 * warning organizers about under-subscribed events. Runs every 10 minutes;
 * each check is naturally idempotent (via `existsForPayload`/`updateMany`
 * `where` guards), so a missed or overlapping run is harmless rather than
 * duplicating notifications.
 */
@Injectable()
export class EventLifecycleScheduler {
  private readonly logger = new Logger(EventLifecycleScheduler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  @Cron(CronExpression.EVERY_10_MINUTES)
  async run(): Promise<void> {
    await Promise.all([
      this.sendEventReminders().catch((err) => this.logger.error("sendEventReminders failed", err)),
      this.completeFinishedEvents().catch((err) => this.logger.error("completeFinishedEvents failed", err)),
      this.warnUnderSubscribedEvents().catch((err) => this.logger.error("warnUnderSubscribedEvents failed", err)),
    ]);
  }

  /** §43 — 24h/1h-before reminders to every actively-registered attendee, skipping opt-outs. */
  private async sendEventReminders(): Promise<void> {
    const hours = await this.getReminderHours();
    const now = new Date();

    for (const hour of hours) {
      const type = REMINDER_TYPE_BY_HOUR[hour];
      if (!type) continue; // only the two MVP slots are supported (§43)

      const threshold = new Date(now.getTime() + hour * 60 * 60 * 1000);
      const events = await this.prisma.event.findMany({
        where: { status: "PUBLISHED", startsAt: { gt: now, lte: threshold } },
        select: { id: true, title: true },
      });

      for (const event of events) {
        const registrations = await this.prisma.registration.findMany({
          where: { eventId: event.id, status: { in: [...ACTIVE_REGISTRATION_STATUSES] } },
          select: { userId: true },
        });

        for (const { userId } of registrations) {
          const preferences = await this.prisma.userPreferences.findUnique({ where: { userId } });
          if (preferences && !preferences.allowEventReminderNotifications) continue;

          const alreadySent = await this.notifications.existsForPayload(userId, type, "eventId", event.id);
          if (alreadySent) continue;

          await this.notifications.create({
            userId,
            type,
            title: hour >= 24 ? "Event tomorrow" : "Event starting soon",
            body: `"${event.title}" starts in about ${hour} hour${hour === 1 ? "" : "s"}.`,
            payloadJson: { eventId: event.id },
          });
        }
      }
    }
  }

  /** §80 — PUBLISHED -> COMPLETED once the event has ended. */
  private async completeFinishedEvents(): Promise<void> {
    await this.prisma.event.updateMany({
      where: { status: "PUBLISHED", endsAt: { lt: new Date() } },
      data: { status: "COMPLETED", completedAt: new Date() },
    });
    // TODO(Phase 8): once reviews exist, create REVIEW_REQUEST notifications
    // for each eligible registrant of events that just completed.
  }

  /** UX §15 — warns the organizer once, after the registration deadline passes with too few active registrations. */
  private async warnUnderSubscribedEvents(): Promise<void> {
    const events = await this.prisma.event.findMany({
      where: {
        status: "PUBLISHED",
        minParticipants: { not: null },
        registrationDeadline: { lt: new Date() },
      },
      select: { id: true, title: true, ownerId: true, minParticipants: true },
    });

    for (const event of events) {
      const activeCount = await this.prisma.registration.count({
        where: { eventId: event.id, status: { in: [...ACTIVE_REGISTRATION_STATUSES] } },
      });
      if (activeCount >= event.minParticipants!) continue;

      const alreadyWarned = await this.notifications.existsForPayload(
        event.ownerId,
        "EVENT_MIN_PARTICIPANTS_WARNING",
        "eventId",
        event.id,
      );
      if (alreadyWarned) continue;

      await this.notifications.create({
        userId: event.ownerId,
        type: "EVENT_MIN_PARTICIPANTS_WARNING",
        title: "Not enough registrations yet",
        body: `"${event.title}" has ${activeCount}/${event.minParticipants} of the minimum you set. You can still run it or cancel it — it won't cancel automatically.`,
        payloadJson: { eventId: event.id },
      });
    }
  }

  private async getReminderHours(): Promise<number[]> {
    const setting = await this.prisma.systemSetting.findUnique({
      where: { key: SystemSettingKey.DEFAULT_REMINDER_HOURS },
    });
    const value = setting?.valueJson;
    return Array.isArray(value)
      ? (value as number[])
      : (SYSTEM_SETTING_DEFAULTS[SystemSettingKey.DEFAULT_REMINDER_HOURS] as number[]);
  }
}
