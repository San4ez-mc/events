import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { timingSafeEqual } from "node:crypto";
import type { Request } from "express";
import type { EnvConfig } from "../config/env.validation";
import { ApiException } from "../common/exceptions/api.exception";

/**
 * The shared-secret check for the funnel's server-to-server calls. It is a guard (not a line inside the handler) so it
 * runs before body validation: a caller without the key gets 401 and learns nothing about the expected payload.
 */
@Injectable()
export class BotKeyGuard implements CanActivate {
  constructor(private readonly config: ConfigService<EnvConfig, true>) {}

  canActivate(context: ExecutionContext): boolean {
    const expected = this.config.get("BOT_INTEGRATION_KEY", { infer: true });
    // Unset = integration disabled; answer like an unknown route rather than hinting it exists.
    if (!expected) throw new ApiException("NOT_FOUND", "Not found", 404);
    const header = context.switchToHttp().getRequest<Request>().headers["x-bot-key"];
    const provided = Array.isArray(header) ? header[0] : header;
    const a = Buffer.from(provided ?? "");
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) throw new ApiException("AUTH_REQUIRED", "Invalid bot key", 401);
    return true;
  }
}
