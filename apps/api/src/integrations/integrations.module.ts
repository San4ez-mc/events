import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { EventsModule } from "../events/events.module";
import { EventMediaModule } from "../event-media/event-media.module";
import { BotIntegrationController } from "./bot-integration.controller";
import { BotIntegrationService } from "./bot-integration.service";
import { BotKeyGuard } from "./bot-key.guard";
import { BotDraftsScheduler } from "./bot-drafts.scheduler";
import { EventImportController } from "./import/event-import.controller";
import { EventImportService } from "./import/event-import.service";

@Module({
  imports: [AuthModule, EventsModule, EventMediaModule],
  controllers: [BotIntegrationController, EventImportController],
  providers: [BotIntegrationService, BotDraftsScheduler, BotKeyGuard, EventImportService],
  exports: [EventImportService],
})
export class IntegrationsModule {}
