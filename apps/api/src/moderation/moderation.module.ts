import { Module } from "@nestjs/common";
import { SensitiveContentService } from "./sensitive-content.service";
import { ModerationService } from "./moderation.service";

@Module({
  providers: [SensitiveContentService, ModerationService],
  exports: [SensitiveContentService, ModerationService],
})
export class ModerationModule {}
