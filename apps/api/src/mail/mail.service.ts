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

  async sendPasswordResetEmail(to: string, resetUrl: string): Promise<void> {
    await this.send(
      to,
      "Відновлення пароля — Кіро",
      `<p>Щоб встановити новий пароль, перейдіть за посиланням:</p><p><a href="${resetUrl}">${resetUrl}</a></p><p>Якщо це були не ви — просто проігноруйте цей лист.</p>`,
    );
  }
}
