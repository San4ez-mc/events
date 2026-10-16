import { Body, Controller, Get, Header, HttpCode, HttpStatus, Param, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { IsEmail, IsUUID, MaxLength } from "class-validator";
import { Public } from "../common/decorators/public.decorator";
import { RateLimit } from "../common/throttle";
import { EventRemindersService } from "./event-reminders.service";

export class RequestEventReminderDto {
  @IsUUID()
  eventId!: string;

  @IsEmail()
  @MaxLength(200)
  email!: string;
}

/** Signed-out "Нагадати мені" — public, rate-limited, one email per (event, address). */
@ApiTags("event-reminders")
@Controller("event-reminders")
export class EventRemindersController {
  constructor(private readonly reminders: EventRemindersService) {}

  @Public()
  @RateLimit(5)
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post()
  async request(@Body() dto: RequestEventReminderDto) {
    await this.reminders.request(dto.eventId, dto.email);
  }

  /** Linked from the reminder email, so it answers with a tiny HTML page rather than JSON. */
  @Public()
  @Get("unsubscribe/:token")
  @Header("Content-Type", "text/html; charset=utf-8")
  async unsubscribe(@Param("token") token: string) {
    const done = await this.reminders.unsubscribe(token.slice(0, 100));
    return `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Кіро</title><body style="font-family:sans-serif;max-width:420px;margin:60px auto;padding:0 16px"><h2>${done ? "Вас відписано" : "Вже відписано"}</h2><p>Нагадування про цю подію більше не надходитимуть.</p>`;
  }
}
