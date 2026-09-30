import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { EnvConfig } from "../config/env.validation";
import { PrismaService } from "../prisma/prisma.service";
import { MailService } from "../mail/mail.service";
import { EditsReporterService } from "../edits-reporter/edits-reporter.service";
import type { SendFeedbackDto } from "./feedback.controller";

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
  ) {}

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
