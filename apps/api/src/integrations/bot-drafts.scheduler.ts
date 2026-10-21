import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { PrismaService } from "../prisma/prisma.service";
import { BOT_SOURCE } from "./bot-integration.service";

const DAY = 24 * 60 * 60 * 1000;
/** A draft the funnel made that nobody opened for this long is clutter, not a lead. */
const STALE_AFTER_DAYS = 30;

/** Housekeeping for what the Telegram funnel leaves behind. */
@Injectable()
export class BotDraftsScheduler {
  private readonly logger = new Logger(BotDraftsScheduler.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Nightly: removes bot drafts untouched for a month, one by one so a single blocked row can't stop the rest. */
  @Cron("0 4 * * *", { timeZone: "Europe/Kyiv" })
  async removeStaleDrafts(): Promise<number> {
    const stale = await this.prisma.event.findMany({
      where: { source: BOT_SOURCE, status: "DRAFT", updatedAt: { lt: new Date(Date.now() - STALE_AFTER_DAYS * DAY) } },
      select: { id: true },
      take: 500,
    });
    let removed = 0;
    for (const { id } of stale) {
      try {
        await this.prisma.event.delete({ where: { id } });
        removed++;
      } catch (err) {
        this.logger.warn(`could not remove stale bot draft ${id}: ${(err as Error).message}`);
      }
    }
    if (removed > 0) this.logger.log(`removed ${removed} stale bot drafts`);
    return removed;
  }
}
