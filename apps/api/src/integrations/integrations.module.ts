import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { EventsModule } from "../events/events.module";
import { BotIntegrationController } from "./bot-integration.controller";
import { BotIntegrationService } from "./bot-integration.service";

@Module({
  imports: [AuthModule, EventsModule],
  controllers: [BotIntegrationController],
  providers: [BotIntegrationService],
})
export class IntegrationsModule {}
