import { Body, Controller, Param, ParseUUIDPipe, Post, UploadedFile, UseGuards, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiTags } from "@nestjs/swagger";
import { DEFAULT_MEDIA_LIMITS } from "@kiro/config";
import { Public } from "../common/decorators/public.decorator";
import { RateLimit } from "../common/throttle";
import { BotIntegrationService } from "./bot-integration.service";
import { BotKeyGuard } from "./bot-key.guard";
import { BotDraftPhotoDto, BotEventDraftDto } from "./dto/bot-event-draft.dto";

/**
 * Server-to-server entry for the FINEKO Flows funnel ("organizer onboarding" Telegram bot).
 * Not a user session: the caller proves itself with a shared secret header (BotKeyGuard, checked before the body is even
 * validated) and can only create or update a DRAFT (never publish — publishing spends a credit and goes through
 * moderation, which stays with the organizer).
 */
@ApiTags("integrations")
@Public()
@UseGuards(BotKeyGuard)
@Controller("integrations/bot")
export class BotIntegrationController {
  constructor(private readonly service: BotIntegrationService) {}

  @RateLimit(30)
  @Post("event-draft")
  create(@Body() dto: BotEventDraftDto) {
    return this.service.createDraft(dto);
  }

  /** Cover photo for a draft this funnel created: multipart `file`, or JSON `{ imageUrl }` (https link to the picture). */
  @RateLimit(30)
  @Post("event-draft/:eventId/photo")
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: DEFAULT_MEDIA_LIMITS.imageMaxBytes } }))
  photo(@Param("eventId", new ParseUUIDPipe()) eventId: string, @Body() dto: BotDraftPhotoDto, @UploadedFile() file: Express.Multer.File | undefined) {
    return this.service.attachPhoto(eventId, dto.imageUrl, file);
  }
}
