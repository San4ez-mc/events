import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { EnvConfig } from "../config/env.validation";

/**
 * Reports text (user feedback, or an unhandled crash) to the FINEKO "Правки" (edits)
 * platform — the shared error/complaint tracker for the whole FINEKO ecosystem. Server-side
 * only, so the ingest token never reaches a browser or the mobile app. Best-effort: never
 * throws, and callers decide their own fallback (e.g. FeedbackService emails instead).
 */
@Injectable()
export class EditsReporterService {
  private readonly logger = new Logger(EditsReporterService.name);

  constructor(private readonly config: ConfigService<EnvConfig, true>) {}

  async report(text: string, source: string, sourceRef?: string, reporterName?: string): Promise<boolean> {
    const token = this.config.get("EDITS_INGEST_TOKEN", { infer: true });
    if (!token) return false;

    try {
      const res = await fetch(this.config.get("EDITS_INGEST_URL", { infer: true }), {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ text, source, sourceRef, reporterName }),
        signal: AbortSignal.timeout(8000),
      });
      if (res.ok) return true;
      this.logger.warn(`Edits ingest answered ${res.status}`);
      return false;
    } catch (error) {
      this.logger.warn(`Edits ingest failed (${String(error)})`);
      return false;
    }
  }
}
