import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { IsString, MaxLength, MinLength } from "class-validator";
import { Transform } from "class-transformer";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { RateLimit } from "../common/throttle";
import type { AuthenticatedUser } from "../auth/types/authenticated-user";
import { InquiriesService } from "./inquiries.service";

export class SendInquiryMessageDto {
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  text!: string;
}

/** "Write to the organizer" (events registered on Kiro). Every route needs a signed-in user and only ever shows their own conversations. */
@ApiTags("inquiries")
@Controller()
export class InquiriesController {
  constructor(private readonly inquiries: InquiriesService) {}

  @HttpCode(HttpStatus.CREATED)
  @RateLimit(20)
  @Post("events/:eventId/inquiries")
  ask(@CurrentUser() user: AuthenticatedUser, @Param("eventId", ParseUUIDPipe) eventId: string, @Body() dto: SendInquiryMessageDto) {
    return this.inquiries.ask(user.id, eventId, dto.text);
  }

  @Get("inquiries")
  listMine(@CurrentUser() user: AuthenticatedUser) {
    return this.inquiries.listMine(user.id);
  }

  @Get("inquiries/by-event/:eventId")
  byEvent(@CurrentUser() user: AuthenticatedUser, @Param("eventId", ParseUUIDPipe) eventId: string) {
    return this.inquiries.getByEvent(user.id, eventId);
  }

  @Get("inquiries/:id")
  get(@CurrentUser() user: AuthenticatedUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.inquiries.get(user.id, id);
  }

  @HttpCode(HttpStatus.CREATED)
  @RateLimit(30)
  @Post("inquiries/:id/messages")
  reply(@CurrentUser() user: AuthenticatedUser, @Param("id", ParseUUIDPipe) id: string, @Body() dto: SendInquiryMessageDto) {
    return this.inquiries.reply(user.id, id, dto.text);
  }
}
