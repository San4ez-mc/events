import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { Transform } from "class-transformer";
import {
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from "class-validator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import type { AuthenticatedUser } from "../auth/types/authenticated-user";
import { ChatService } from "./chat.service";

class ListChatQueryDto {
  @IsOptional()
  @IsUUID("4")
  before?: string;
}

class PostChatMessageDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim() : value,
  )
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  text!: string;
}

/** UX §28 — event group chat (confirmed participants + organizers). */
@ApiTags("chat")
@Controller("events/:eventId/chat")
export class ChatController {
  constructor(private readonly chat: ChatService) {}

  @Get()
  list(
    @Param("eventId", ParseUUIDPipe) eventId: string,
    @Query() query: ListChatQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.chat.list(eventId, user.id, query.before);
  }

  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  @Post()
  post(
    @Param("eventId", ParseUUIDPipe) eventId: string,
    @Body() dto: PostChatMessageDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.chat.post(eventId, user.id, dto.text);
  }

  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete(":messageId")
  async remove(
    @Param("eventId", ParseUUIDPipe) eventId: string,
    @Param("messageId", ParseUUIDPipe) messageId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.chat.remove(eventId, user.id, messageId);
  }
}
