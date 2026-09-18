import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";
import type { EnvConfig } from "../config/env.validation";

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

  async sendPasswordResetEmail(to: string, resetUrl: string): Promise<void> {
    await this.send(
      to,
      "Відновлення пароля — Кіро",
      `<p>Щоб встановити новий пароль, перейдіть за посиланням:</p><p><a href="${resetUrl}">${resetUrl}</a></p><p>Якщо це були не ви — просто проігноруйте цей лист.</p>`,
    );
  }
}
