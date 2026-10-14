import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import sharp from "sharp";
import type { EnvConfig } from "../config/env.validation";
import { PrismaService } from "../prisma/prisma.service";
import { MailService } from "../mail/mail.service";
import { StorageService } from "../storage/storage.service";
import { NotificationsService } from "../notifications/notifications.service";
import { ApiException } from "../common/exceptions/api.exception";
import { EditsReporterService } from "../edits-reporter/edits-reporter.service";
import type { SendFeedbackDto, SendFeedbackReportDto } from "./feedback.controller";

/**
 * Sends user feedback to the FINEKO "Правки" platform. Without a token, or if that
 * service is down, it falls back to an email so a report is never lost.
 */
@Injectable()
export class FeedbackService {
  constructor(
    private readonly config: ConfigService<EnvConfig, true>,
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly editsReporter: EditsReporterService,
    private readonly storage: StorageService,
    private readonly notifications: NotificationsService,
  ) {}

  /** Stores a report for the admin panel (screenshot re-encoded to a bounded JPEG, which also drops EXIF/GPS) and pings the admins. */
  async submitReport(dto: SendFeedbackReportDto, file: Express.Multer.File | undefined, userId: string | undefined): Promise<void> {
    let screenshotUrl: string | null = null;
    if (file) {
      if (!file.mimetype.startsWith("image/")) {
        throw new ApiException("VALIDATION_ERROR", "Screenshot must be an image", 400, { file: ["Not an image"] });
      }
      let buffer: Buffer;
      try {
        buffer = await sharp(file.buffer, { failOn: "none" })
          .rotate()
          .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
          .jpeg({ quality: 80 })
          .toBuffer();
      } catch {
        throw new ApiException("VALIDATION_ERROR", "Unreadable image", 400, { file: ["Unreadable image"] });
      }
      screenshotUrl = (await this.storage.putObject(this.storage.buildKey("feedback", "screenshot.jpg"), buffer, "image/jpeg")).url;
    }

    const user = userId ? await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true, name: true, nickname: true } }) : null;
    const text = dto.text.trim();
    await this.prisma.feedbackReport.create({
      data: {
        userId: user?.id ?? null,
        message: text,
        screenshotUrl,
        context: dto.context?.trim() || null,
        platform: dto.platform ?? null,
        appVersion: dto.appVersion ?? null,
        buildNumber: dto.buildNumber ?? null,
        device: dto.device ?? null,
      },
    });

    const author = user?.name ?? user?.nickname ?? "Anonymous";
    await this.notifications
      .notifyStaff({
        roles: ["ADMIN", "SUPER_ADMIN"],
        title: "New problem report",
        body: `${author}: ${text.length > 140 ? `${text.slice(0, 140)}…` : text}`,
        adminTab: "feedback",
        excludeUserId: user?.id,
      })
      .catch(() => undefined);
  }

  async send(dto: SendFeedbackDto, userId: string | undefined): Promise<void> {
    const user = userId ? await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true, email: true, name: true } }) : null;
    const meta = [
      `Kind: ${dto.kind === "idea" ? "idea" : "problem"}`,
      `Platform: ${dto.platform ?? "unknown"}`,
      `App version: ${dto.appVersion ?? "?"} (build ${dto.buildNumber ?? "?"})`,
      `Device: ${dto.device ?? "?"}`,
      `User: ${user ? `${user.name ?? "—"} <${user.email}> (${user.id})` : "anonymous"}`,
    ].join("\n");
    const text = `${dto.text.trim()}\n\n— — —\n${meta}`;

    const sent = await this.editsReporter.report(text, "kiro", user?.id ?? undefined, user?.name ?? undefined);
    if (sent) return;

    const escaped = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>");
    await this.mail.send(this.config.get("FEEDBACK_TO", { infer: true }), `[Kiro] ${dto.kind === "idea" ? "Idea" : "Problem"} report`, `<p>${escaped}</p>`);
  }
}
