import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";
import type { EnvConfig } from "../config/env.validation";

const escapeHtml = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * Thin mail abstraction. With no SMTP_* env vars set (dev/staging default) it
 * just logs the email instead of sending — lets auth flows be fully testable
 * without a mail server. Wire real SMTP by setting SMTP_HOST/PORT/USER/PASS.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: Transporter | null;
  private readonly from: string;

  constructor(configService: ConfigService<EnvConfig, true>) {
    this.from = configService.get("SMTP_FROM", { infer: true });
    const host = configService.get("SMTP_HOST", { infer: true });
    const port = configService.get("SMTP_PORT", { infer: true });
    const user = configService.get("SMTP_USER", { infer: true });
    const pass = configService.get("SMTP_PASS", { infer: true });

    this.transporter =
      host && port
        ? nodemailer.createTransport({
            host,
            port,
            secure: port === 465,
            auth: user && pass ? { user, pass } : undefined,
          })
        : null;
  }

  async send(to: string, subject: string, html: string): Promise<void> {
    if (!this.transporter) {
      this.logger.log(`[dev mail] to=${to} subject="${subject}"\n${html}`);
      return;
    }
    await this.transporter.sendMail({ from: this.from, to, subject, html });
  }

  async sendVerificationEmail(to: string, verifyUrl: string): Promise<void> {
    await this.send(
      to,
      "Підтвердження email — Кіро",
      `<p>Підтвердіть свій email, перейшовши за посиланням:</p><p><a href="${verifyUrl}">${verifyUrl}</a></p>`,
    );
  }

  /** A new organizer whose account was created from the Telegram bot: explains the draft and gives the set-password link. */
  async sendBotDraftWelcomeEmail(to: string, p: { title: string; setPasswordUrl: string; playUrl: string }): Promise<void> {
    await this.send(
      to,
      `Ваша подія «${p.title}» чекає на публікацію — Кіро`,
      `<p>Вітаємо! Через Telegram-бот ви почали створювати подію <b>«${escapeHtml(p.title)}»</b>. Ми зберегли її на Кіро як чернетку.</p>
       <p><b>Щоб опублікувати:</b></p>
       <ol>
         <li>Встановіть пароль (посилання діє 7 днів): <a href="${p.setPasswordUrl}">встановити пароль і продовжити</a></li>
         <li>Увійдіть, перевірте подію й натисніть «Опублікувати». Перші публікації безкоштовні.</li>
       </ol>
       <p>Керувати подіями зручно й із застосунку: <a href="${p.playUrl}">Кіро в Google Play</a>.</p>
       <p style="color:#888;font-size:12px">Якщо це були не ви — просто проігноруйте лист: поки ви не публікуєте, чернетку ніхто не бачить.</p>`,
    );
  }

  /** The account already existed: tell its owner a draft appeared, so a stranger typing their address is visible and harmless. */
  async sendBotDraftAddedEmail(to: string, p: { title: string; editUrl: string }): Promise<void> {
    await this.send(
      to,
      `Чернетка «${p.title}» додана до вашого акаунта — Кіро`,
      `<p>Через Telegram-бот до вашого акаунта в Кіро додано чернетку <b>«${escapeHtml(p.title)}»</b>.</p>
       <p><a href="${p.editUrl}">Відкрити й завершити</a> (потрібно увійти).</p>
       <p style="color:#888;font-size:12px">Це були не ви? Просто видаліть чернетку в розділі «Мої події»: нічого не опубліковано.</p>`,
    );
  }

  /** One nudge for a draft nobody finished, for organizers who have no app (so no push can reach them). */
  async sendDraftReminderEmail(to: string, p: { title: string; editUrl: string }): Promise<void> {
    await this.send(
      to,
      `Завершіть подію «${p.title}» — Кіро`,
      `<p>Ваша чернетка <b>«${escapeHtml(p.title)}»</b> ще не опублікована. Завершити й опублікувати можна за хвилину:</p>
       <p><a href="${p.editUrl}">Відкрити чернетку</a></p>`,
    );
  }

  /** Weekly "куди піти" for an address that subscribed without an account. */
  async sendCityDigestEmail(
    to: string,
    p: { cityName: string | null; events: Array<{ title: string; url: string }>; moreUrl: string; createUrl: string; unsubscribeUrl: string },
  ): Promise<void> {
    const where = p.cityName ? ` у місті ${escapeHtml(p.cityName)}` : "";
    const list = p.events.map((e) => `<li style="margin:6px 0"><a href="${e.url}">${escapeHtml(e.title)}</a></li>`).join("");
    await this.send(
      to,
      `Куди піти на вихідних${p.cityName ? `: ${p.cityName}` : ""} — Кіро`,
      `<p>Найцікавіше на цих вихідних${where}:</p>
       <ul style="padding-left:18px">${list}</ul>
       <p><a href="${p.moreUrl}">Усі події вихідних</a></p>
       <p>Організовуєте щось самі? <a href="${p.createUrl}">Опублікуйте подію безкоштовно</a>.</p>
       <p style="color:#888;font-size:12px">Ви отримали цей лист, бо підписались на добірку подій. <a href="${p.unsubscribeUrl}">Відписатися</a></p>`,
    );
  }

  /** One-off: someone searched a city that had no events, and now it has some. */
  async sendCityEventsAppearedEmail(to: string, p: { cityName: string; count: number; url: string; unsubscribeUrl: string }): Promise<void> {
    await this.send(
      to,
      `У місті ${p.cityName} з'явились події — Кіро`,
      `<p>Ви шукали події у місті <b>${escapeHtml(p.cityName)}</b> і нічого не знайшли. Тепер вони є: <b>${p.count}</b>.</p>
       <p><a href="${p.url}">Подивитись афішу</a></p>
       <p style="color:#888;font-size:12px">Це одноразовий лист. <a href="${p.unsubscribeUrl}">Відписатися</a></p>`,
    );
  }

  async sendPasswordResetEmail(to: string, resetUrl: string): Promise<void> {
    await this.send(
      to,
      "Відновлення пароля — Кіро",
      `<p>Щоб встановити новий пароль, перейдіть за посиланням:</p><p><a href="${resetUrl}">${resetUrl}</a></p><p>Якщо це були не ви — просто проігноруйте цей лист.</p>`,
    );
  }
}
