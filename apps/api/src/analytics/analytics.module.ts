import { Global, Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { AnalyticsController } from "./analytics.controller";
import { AnalyticsService } from "./analytics.service";

/** Global so save / registration / stats code can record or read analytics without wiring imports. */
@Global()
@Module({
  imports: [AuthModule],
  controllers: [AnalyticsController],
  providers: [AnalyticsService],
  exports: [AnalyticsService],
})
export class AnalyticsModule {}
