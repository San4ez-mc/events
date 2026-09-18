import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiConsumes, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import type { AuthenticatedUser } from "../auth/types/authenticated-user";
import { ApiException } from "../common/exceptions/api.exception";
import { DEFAULT_MEDIA_LIMITS } from "@kiro/config";
import { EventMediaService } from "./event-media.service";
import { ReorderMediaDto } from "./dto/reorder-media.dto";
import { UpdateFocalPointDto } from "./dto/update-focal-point.dto";

@ApiTags("event-media")
@Controller("events/:eventId/media")
export class EventMediaController {
  constructor(private readonly eventMediaService: EventMediaService) {}

  @Post()
  @ApiConsumes("multipart/form-data")
  @UseInterceptors(
    FileInterceptor("file", {
      limits: { fileSize: DEFAULT_MEDIA_LIMITS.videoMaxBytes }, // widest cap; exact per-type check happens in the service
    }),
  )
  upload(
    @CurrentUser() user: AuthenticatedUser,
    @Param("eventId") eventId: string,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    if (!file) {
      throw new ApiException("VALIDATION_ERROR", "No file uploaded", 400, { file: ["Required"] });
    }
    return this.eventMediaService.upload(eventId, user.id, file);
  }

  @Patch("reorder")
  reorder(
    @CurrentUser() user: AuthenticatedUser,
    @Param("eventId") eventId: string,
    @Body() dto: ReorderMediaDto,
  ) {
    return this.eventMediaService.reorder(eventId, user.id, dto.mediaIds);
  }

  @Patch(":mediaId/focal-point")
  updateFocalPoint(
    @CurrentUser() user: AuthenticatedUser,
    @Param("eventId") eventId: string,
    @Param("mediaId") mediaId: string,
    @Body() dto: UpdateFocalPointDto,
  ) {
    return this.eventMediaService.updateFocalPoint(eventId, user.id, mediaId, dto.focalX, dto.focalY);
  }

  @Delete(":mediaId")
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param("eventId") eventId: string,
    @Param("mediaId") mediaId: string,
  ) {
    return this.eventMediaService.remove(eventId, user.id, mediaId);
  }
}
