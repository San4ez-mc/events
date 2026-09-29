import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { PrismaService } from "../prisma/prisma.service";
import { PlatformSubscriptionsService } from "./platform-subscriptions.service";

/**
 * Play subscriptions auto-renew on Google's side; without either this or an RTDN (Pub/Sub) webhook
 * (not set up yet — see PlatformSubscriptionsController), the server would never find out a renewal
 * happened and would incorrectly drop access at the old expiry. Runs hourly and only touches rows
 * actually due (expiresAt within the next day, or already past it, i.e. renewed-or-truly-lapsed) —
 * cheap even with many subscribers, since most rows aren't due most hours.
 */
@Injectable()
export class SubscriptionRecheckScheduler {
  private readonly logger = new Logger(SubscriptionRecheckScheduler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly subscriptionsService: PlatformSubscriptionsService,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async run(): Promise<void> {
    const dueBy = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const due = await this.prisma.platformSubscription.findMany({
      where: { provider: "GOOGLE_PLAY", status: { in: ["ACTIVE", "GRACE_PERIOD"] }, expiresAt: { lte: dueBy } },
      select: { id: true },
    });
    for (const { id } of due) {
      await this.subscriptionsService.recheckGoogleSubscription(id).catch((err) => this.logger.error(`recheck ${id} failed`, err));
    }
  }
}
