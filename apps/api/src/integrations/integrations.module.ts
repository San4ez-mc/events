import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { EventsModule } from "../events/events.module";
import { EventMediaModule } from "../event-media/event-media.module";
import { BotIntegrationController } from "./bot-integration.controller";
import { BotIntegrationService } from "./bot-integration.service";
import { BotDraftsScheduler } from "./bot-drafts.scheduler";

@Module({
  imports: [AuthModule, EventsModule, EventMediaModule],
  controllers: [BotIntegrationController],
  providers: [BotIntegrationService, BotDraftsScheduler],
})
export class IntegrationsModule {}
