import { Body, Controller, Get, Header, HttpCode, HttpStatus, Param, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { IsEmail, IsEnum, IsOptional, IsString, IsUUID, MaxLength } from "class-validator";
import { Public } from "../common/decorators/public.decorator";
import { RateLimit } from "../common/throttle";
import { CityAlertsService } from "./city-alerts.service";

enum CityAlertKindDto {
  DIGEST = "DIGEST",
  NO_EVENTS = "NO_EVENTS",
}

export class SubscribeCityAlertDto {
  @IsEmail()
  @MaxLength(200)
  email!: string;

  @IsEnum(CityAlertKindDto)
  kind!: CityAlertKindDto;

  @IsOptional()
  @IsUUID()
  cityId?: string;

  /** What was searched when nothing was found. */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  query?: string;
}

/** Signed-out email subscriptions: weekly city digest and "tell me when events appear". Public, rate-limited. */
@ApiTags("city-alerts")
@Controller("city-alerts")
export class CityAlertsController {
  constructor(private readonly alerts: CityAlertsService) {}

  @Public()
  @RateLimit(5)
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post()
  async subscribe(@Body() dto: SubscribeCityAlertDto) {
    await this.alerts.subscribe(dto);
  }

  /** Linked from every email, so it answers with a tiny HTML page rather than JSON. */
  @Public()
  @Get("unsubscribe/:token")
  @Header("Content-Type", "text/html; charset=utf-8")
  async unsubscribe(@Param("token") token: string) {
    const done = await this.alerts.unsubscribe(token.slice(0, 100));
    return `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Кіро</title><body style="font-family:sans-serif;max-width:420px;margin:60px auto;padding:0 16px"><h2>${done ? "Вас відписано" : "Вже відписано"}</h2><p>Ці листи більше не надходитимуть.</p>`;
  }
}
