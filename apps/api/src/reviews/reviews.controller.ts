import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Query } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { Public } from "../common/decorators/public.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import type { AuthenticatedUser } from "../auth/types/authenticated-user";
import { ReviewsService } from "./reviews.service";
import { CreateReviewDto } from "./dto/create-review.dto";
import { ListReviewsDto } from "./dto/list-reviews.dto";

@ApiTags("reviews")
@Controller()
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @Post("events/:eventId/reviews")
  upsert(
    @CurrentUser() user: AuthenticatedUser,
    @Param("eventId") eventId: string,
    @Body() dto: CreateReviewDto,
  ) {
    return this.reviewsService.upsert(eventId, user.id, dto);
  }

  @Public()
  @Get("events/:eventId/reviews")
  listForEvent(@Param("eventId") eventId: string, @Query() query: ListReviewsDto) {
    return this.reviewsService.listForEvent(eventId, query);
  }

  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete("reviews/:id")
  remove(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.reviewsService.remove(id, user.id);
  }
}
