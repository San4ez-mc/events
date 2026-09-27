import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { EnvConfig } from "../config/env.validation";
import { PrismaService } from "../prisma/prisma.service";
import { MailService } from "../mail/mail.service";
import type { SendFeedbackDto } from "./feedback.controller";

/**
 * Sends user feedback to the FINEKO "Правки" platform (server-side, so its ingest token never reaches the app).
 * Without a token, or if that service is down, it falls back to an email so a report is never lost.
 */
@Injectable()
export class FeedbackService {
  private readonly logger = new Logger(FeedbackService.name);

  constructor(
    private readonly config: ConfigService<EnvConfig, true>,
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
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

    const token = this.config.get("EDITS_INGEST_TOKEN", { infer: true });
    if (token) {
      try {
        const res = await fetch(this.config.get("EDITS_INGEST_URL", { infer: true }), {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ text, source: "kiro", sourceRef: user?.id ?? undefined, reporterName: user?.name ?? undefined }),
          signal: AbortSignal.timeout(8000),
        });
        if (res.ok) return;
        this.logger.warn(`Edits ingest answered ${res.status}; falling back to email`);
      } catch (error) {
        this.logger.warn(`Edits ingest failed (${String(error)}); falling back to email`);
      }
    }

    const escaped = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>");
    await this.mail.send(this.config.get("FEEDBACK_TO", { infer: true }), `[Kiro] ${dto.kind === "idea" ? "Idea" : "Problem"} report`, `<p>${escaped}</p>`);
  }
}
