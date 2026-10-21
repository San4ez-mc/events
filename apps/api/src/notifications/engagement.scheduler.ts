import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Cron } from "@nestjs/schedule";
import type { EnvConfig } from "../config/env.validation";
import { PrismaService } from "../prisma/prisma.service";
import { MailService } from "../mail/mail.service";
import { kyivDayStart, kyivIsoWeek, kyivWeekday } from "../common/utils/kyiv-time";
import { NotificationsService } from "./notifications.service";
import { EventRemindersService } from "./event-reminders.service";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
/** Listing profiles are curated by us and can't sign in, so they never get product nudges. */
const LISTING_DOMAIN = "@listings.kiro.invalid";

/** Real, active, non-staff accounts — the audience for nudges. */
const REAL_USER = { status: "ACTIVE", role: "USER", NOT: { email: { endsWith: LISTING_DOMAIN } } } as const;

/**
 * Growth nudges that don't hang off a user action: "share your event" follow-up, unfinished-draft and
 * unconfirmed-email reminders, the Thursday weekend digest, and the email reminders guests asked for.
 * Each job is idempotent via `existsForPayload` (or `sentAt`), so overlapping or repeated runs never double-send.
 */
@Injectable()
export class EngagementScheduler {
  private readonly logger = new Logger(EngagementScheduler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly guestReminders: EventRemindersService,
    private readonly mail: MailService,
    private readonly config: ConfigService<EnvConfig, true>,
  ) {}

  @Cron("*/15 * * * *")
  async run(): Promise<void> {
    await Promise.all([
      this.sendShareReminders().catch((err) => this.logger.error("sendShareReminders failed", err)),
      this.sendDraftReminders().catch((err) => this.logger.error("sendDraftReminders failed", err)),
      this.sendVerifyEmailNudges().catch((err) => this.logger.error("sendVerifyEmailNudges failed", err)),
      this.guestReminders.sendDue().catch((err) => this.logger.error("guest reminders failed", err)),
    ]);
  }

  /** Thursday evening: what's on this weekend, in the user's own city when they picked one. */
  @Cron("0 18 * * 4", { timeZone: "Europe/Kyiv" })
  async weekendDigest(): Promise<void> {
    await this.sendWeekendDigest().catch((err) => this.logger.error("sendWeekendDigest failed", err));
  }

  /** One follow-up 24–72h after publishing if the organizer never generated a share picture for the event. */
  private async sendShareReminders(): Promise<void> {
    const now = new Date();
    const events = await this.prisma.event.findMany({
      where: {
        status: "PUBLISHED",
        isTest: false,
        publishedAt: { gte: new Date(now.getTime() - 3 * DAY), lte: new Date(now.getTime() - DAY) },
        startsAt: { gt: now },
        owner: REAL_USER,
      },
      select: { id: true, title: true, ownerId: true },
      take: 200,
    });
    for (const event of events) {
      if (await this.notifications.existsForPayload(event.ownerId, "SHARE_PROMPT", "reminderEventId", event.id)) continue;
      const shared = await this.prisma.eventAnalyticsEvent.count({ where: { eventId: event.id, action: "SHARE_IMAGE" } });
      if (shared > 0) continue;
      await this.notifications
        .create({
          userId: event.ownerId,
          type: "SHARE_PROMPT",
          title: "Share your event",
          body: `"${event.title}" hasn't been shared yet. Organizers who post a story get more people: it takes 10 seconds.`,
          payloadJson: { eventId: event.id, reminderEventId: event.id, screen: "share" },
        })
        .catch(() => undefined);
    }
  }

  /** A draft left untouched for a day gets one nudge (and never more than one per three days per person). */
  private async sendDraftReminders(): Promise<void> {
    const now = new Date();
    const drafts = await this.prisma.event.findMany({
      where: {
        status: "DRAFT",
        isTest: false,
        title: { not: "" },
        updatedAt: { gte: new Date(now.getTime() - 14 * DAY), lte: new Date(now.getTime() - DAY) },
        owner: REAL_USER,
      },
      select: { id: true, title: true, ownerId: true, owner: { select: { email: true } } },
      take: 200,
    });
    for (const draft of drafts) {
      if (await this.notifications.existsForPayload(draft.ownerId, "DRAFT_REMINDER", "draftId", draft.id)) continue;
      const recent = await this.prisma.notification.count({
        where: { userId: draft.ownerId, type: "DRAFT_REMINDER", createdAt: { gte: new Date(now.getTime() - 3 * DAY) } },
      });
      if (recent > 0) continue;
      await this.notifications
        .create({
          userId: draft.ownerId,
          type: "DRAFT_REMINDER",
          title: "Finish your event",
          body: `"${draft.title}" is still a draft. Finish it and publish in a minute.`,
          payloadJson: { draftId: draft.id, eventId: draft.id, screen: "edit" },
        })
        .catch(() => undefined);

      // Organizers who came in through the chat bot or the website have no app, so no push can reach them: use email.
      if ((await this.prisma.userDevice.count({ where: { userId: draft.ownerId, active: true } })) === 0) {
        const editUrl = `${this.config.get("APP_URL", { infer: true }).replace(/\/$/, "")}/organizer/events/${draft.id}/edit`;
        await this.mail.sendDraftReminderEmail(draft.owner.email, { title: draft.title, editUrl }).catch((err) => this.logger.warn(`draft reminder email failed: ${err}`));
      }
    }
  }

  /** One nudge for accounts that never confirmed their email (needed for recovery and receipts). */
  private async sendVerifyEmailNudges(): Promise<void> {
    const now = new Date();
    const users = await this.prisma.user.findMany({
      where: { ...REAL_USER, emailVerifiedAt: null, createdAt: { gte: new Date(now.getTime() - 21 * DAY), lte: new Date(now.getTime() - DAY) } },
      select: { id: true },
      take: 200,
    });
    for (const user of users) {
      if (await this.notifications.existsForPayload(user.id, "ACCOUNT_REMINDER", "kind", "verify-email")) continue;
      await this.notifications
        .create({
          userId: user.id,
          type: "ACCOUNT_REMINDER",
          title: "Confirm your email",
          body: "Confirm your email so you don't lose access and can get reminders.",
          payloadJson: { kind: "verify-email", screen: "verify" },
        })
        .catch(() => undefined);
    }
  }

  private async sendWeekendDigest(): Promise<void> {
    const now = new Date();
    const daysToFriday = (5 - kyivWeekday(now) + 7) % 7;
    const from = kyivDayStart(now, daysToFriday);
    const to = kyivDayStart(now, daysToFriday + 3);
    const week = kyivIsoWeek(from);

    const events = await this.prisma.event.findMany({
      where: { status: "PUBLISHED", isTest: false, visibility: "PUBLIC", startsAt: { gte: from, lt: to } },
      select: { id: true, title: true, cityId: true, city: { select: { nameUk: true } } },
    });
    if (events.length === 0) return;

    // Most-viewed first, so the three named in the message are the ones people actually open.
    const views = await this.prisma.eventDailyStat.groupBy({ by: ["eventId"], where: { eventId: { in: events.map((e) => e.id) } }, _sum: { views: true } });
    const viewsById = new Map(views.map((v) => [v.eventId, v._sum.views ?? 0]));
    const ranked = [...events].sort((a, b) => (viewsById.get(b.id) ?? 0) - (viewsById.get(a.id) ?? 0));

    const users = await this.prisma.user.findMany({
      where: { ...REAL_USER, OR: [{ preferences: { is: null } }, { preferences: { is: { allowSubscriptionNotifications: true } } }] },
      select: { id: true, preferences: { select: { preferredCityId: true } } },
    });
    for (const user of users) {
      if (await this.notifications.existsForPayload(user.id, "WEEKLY_DIGEST", "week", week)) continue;
      const cityId = user.preferences?.preferredCityId ?? null;
      const mine = cityId ? ranked.filter((e) => e.cityId === cityId) : ranked;
      if (mine.length === 0) continue;
      const names = mine.slice(0, 3).map((e) => `"${e.title}"`).join(", ");
      const city = cityId ? mine[0]!.city?.nameUk : null;
      const text = `${mine.length} events this weekend — ${names}.`;
      await this.notifications
        .create({
          userId: user.id,
          type: "WEEKLY_DIGEST",
          title: "This weekend on Kiro",
          body: city ? `${city}: ${text}` : text,
          payloadJson: { week, screen: "discover" },
        })
        .catch(() => undefined);
    }
  }
}
