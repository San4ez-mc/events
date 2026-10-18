import { Body, Controller, Headers, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { ConfigService } from "@nestjs/config";
import { timingSafeEqual } from "node:crypto";
import type { EnvConfig } from "../config/env.validation";
import { Public } from "../common/decorators/public.decorator";
import { RateLimit } from "../common/throttle";
import { ApiException } from "../common/exceptions/api.exception";
import { BotIntegrationService } from "./bot-integration.service";
import { BotEventDraftDto } from "./dto/bot-event-draft.dto";

/**
 * Server-to-server entry for the FINEKO Flows funnel ("organizer onboarding" Telegram bot).
 * Not a user session: the caller proves itself with a shared secret header and can only create a DRAFT
 * (never publish — publishing spends a credit and goes through moderation, which stays with the organizer).
 */
@ApiTags("integrations")
@Controller("integrations/bot")
export class BotIntegrationController {
  constructor(
    private readonly service: BotIntegrationService,
    private readonly config: ConfigService<EnvConfig, true>,
  ) {}

  @Public()
  @RateLimit(30)
  @Post("event-draft")
  create(@Headers("x-bot-key") key: string | undefined, @Body() dto: BotEventDraftDto) {
    this.assertKey(key);
    return this.service.createDraft(dto);
  }

  private assertKey(provided: string | undefined): void {
    const expected = this.config.get("BOT_INTEGRATION_KEY", { infer: true });
    // Unset = integration disabled; answer like an unknown route rather than hinting it exists.
    if (!expected) throw new ApiException("NOT_FOUND", "Not found", 404);
    const a = Buffer.from(provided ?? "");
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new ApiException("AUTH_REQUIRED", "Invalid bot key", 401);
    }
  }
}
