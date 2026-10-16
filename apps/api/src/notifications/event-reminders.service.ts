import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { randomBytes } from "node:crypto";
import type { EnvConfig } from "../config/env.validation";
import { PrismaService } from "../prisma/prisma.service";
import { MailService } from "../mail/mail.service";
import { ApiException } from "../common/exceptions/api.exception";
import { ResourceNotFoundException } from "../common/exceptions/common-exceptions";

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * "Нагадати мені": a signed-out visitor leaves an email on an event page and gets one reminder ~24h before the start,
 * with a way to unsubscribe and an invitation to create an account. Low-friction first step instead of a login wall.
 */
@Injectable()
export class EventRemindersService {
  private readonly logger = new Logger(EventRemindersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly config: ConfigService<EnvConfig, true>,
  ) {}

  async request(eventId: string, rawEmail: string): Promise<void> {
    const email = rawEmail.trim().toLowerCase();
    const event = await this.prisma.event.findUnique({ where: { id: eventId }, select: { status: true, startsAt: true } });
    if (!event) throw new ResourceNotFoundException("Event not found");
    if (event.status !== "PUBLISHED" || !event.startsAt || event.startsAt.getTime() < Date.now()) {
      throw new ApiException("VALIDATION_ERROR", "Reminders are only available for upcoming published events", 400);
    }
    await this.prisma.eventReminderRequest.upsert({
      where: { eventId_email: { eventId, email } },
      create: { eventId, email, token: randomBytes(24).toString("hex") },
      update: {},
    });
  }

  /** Returns false when the token is unknown (already unsubscribed). */
  async unsubscribe(token: string): Promise<boolean> {
    const { count } = await this.prisma.eventReminderRequest.deleteMany({ where: { token } });
    return count > 0;
  }

  /** Emails everyone whose event starts within the next 24h and who hasn't been reminded yet. */
  async sendDue(): Promise<void> {
    const now = new Date();
    const due = await this.prisma.eventReminderRequest.findMany({
      where: { sentAt: null, event: { status: "PUBLISHED", startsAt: { gt: now, lte: new Date(now.getTime() + 24 * 60 * 60 * 1000) } } },
      include: { event: { select: { slug: true, title: true, startsAt: true, addressText: true, format: true } } },
      take: 100,
    });
    const base = this.config.get("APP_URL", { infer: true }).replace(/\/$/, "");
    for (const r of due) {
      const when = new Intl.DateTimeFormat("uk-UA", { timeZone: "Europe/Kyiv", weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }).format(r.event.startsAt!);
      const title = escapeHtml(r.event.title);
      const place = r.event.format !== "ONLINE" && r.event.addressText ? `<p>📍 ${escapeHtml(r.event.addressText)}</p>` : "";
      const html = `
        <p>Нагадуємо про подію, яку ви обрали в Кіро:</p>
        <h2 style="margin:8px 0">${title}</h2>
        <p>🗓 ${escapeHtml(when)}</p>
        ${place}
        <p><a href="${base}/events/${encodeURIComponent(r.event.slug)}">Відкрити подію</a></p>
        <p>Створіть акаунт у Кіро, щоб отримувати такі нагадування в застосунку та реєструватись на події в один дотик: <a href="${base}/register">створити акаунт</a>.</p>
        <p style="color:#888;font-size:12px">Ви отримали цей лист, бо залишили свою пошту на сторінці події. <a href="${base}/api/v1/event-reminders/unsubscribe/${r.token}">Відписатися</a></p>`;
      try {
        await this.mail.send(r.email, `Нагадування: ${r.event.title}`, html);
        await this.prisma.eventReminderRequest.update({ where: { id: r.id }, data: { sentAt: new Date() } });
      } catch (err) {
        this.logger.warn(`Reminder email to ${r.id} failed: ${(err as Error).message}`);
      }
    }
  }
}
