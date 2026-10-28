import { Body, Controller, Param, Post, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { IsArray, IsBoolean, IsInt, IsISO8601, IsOptional, IsString, Max, MaxLength, Min } from "class-validator";
import { Public } from "../../common/decorators/public.decorator";
import { RateLimit } from "../../common/throttle";
import { BotKeyGuard } from "../bot-key.guard";
import { EventImportService, type ImportOptions } from "./event-import.service";

export class ImportRunDto implements ImportOptions {
  @IsOptional() @IsInt() @Min(1) @Max(100) limit?: number;
  @IsOptional() @IsInt() @Min(1) @Max(500) scan?: number;
  @IsOptional() @IsInt() @Min(0) offset?: number;
  @IsOptional() @IsISO8601() from?: string;
  @IsOptional() @IsISO8601() to?: string;
  @IsOptional() @IsString() @MaxLength(200) include?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) cities?: string[];
  @IsOptional() @IsBoolean() dryRun?: boolean;
}

/**
 * Server-to-server: lets the FINEKO Flows scheduler (cron) pull new events from an outside listing site. Same shared-secret
 * header as the Telegram integration. Everything lands as PUBLISHED under the single "Зовнішній організатор" profile.
 */
@ApiTags("integrations")
@Public()
@UseGuards(BotKeyGuard)
@Controller("integrations/import")
export class EventImportController {
  constructor(private readonly service: EventImportService) {}

  @RateLimit(5)
  @Post(":source")
  run(@Param("source") source: string, @Body() dto: ImportRunDto) {
    return this.service.run(source, dto);
  }
}
