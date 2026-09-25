import { Body, Controller, Get, Param, Patch, Query, Req } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from "class-validator";
import { Type } from "class-transformer";
import type { Request } from "express";
import { Roles } from "../../common/decorators/roles.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import type { AuthenticatedUser } from "../../auth/types/authenticated-user";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditLogService } from "../../audit/audit-log.service";
import { ResourceNotFoundException } from "../../common/exceptions/common-exceptions";

const STATUSES = ["PUBLISHED", "HIDDEN", "REMOVED"] as const;

class ListAdminReviewsDto {
  @IsOptional()
  @IsIn(STATUSES)
  status?: (typeof STATUSES)[number];

  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}

class SetReviewStatusDto {
  @IsIn(STATUSES)
  status!: (typeof STATUSES)[number];
}

/** §37/§72 — moderators hide or remove abusive reviews; every change is audited. */
@ApiTags("admin")
@Roles("MODERATOR", "ADMIN", "SUPER_ADMIN")
@Controller("admin/reviews")
export class AdminReviewsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
  ) {}

  @Get()
  async list(@Query() query: ListAdminReviewsDto) {
    const limit = query.limit ?? 20;
    const rows = await this.prisma.eventReview.findMany({
      where: { status: query.status },
      orderBy: { createdAt: "desc" },
      take: limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      include: {
        event: { select: { id: true, title: true, slug: true } },
        author: { select: { id: true, name: true, nickname: true } },
      },
    });
    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    return { items, nextCursor: hasMore ? items[items.length - 1]!.id : null, hasMore };
  }

  @Patch(":id")
  async setStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
    @Param("id") id: string,
    @Body() dto: SetReviewStatusDto,
  ) {
    const before = await this.prisma.eventReview.findUnique({ where: { id }, select: { status: true } });
    if (!before) throw new ResourceNotFoundException("Review not found");
    const updated = await this.prisma.eventReview.update({ where: { id }, data: { status: dto.status } });
    await this.auditLog.record({
      actorUserId: user.id,
      action: `REVIEW_${dto.status}`,
      entityType: "EventReview",
      entityId: id,
      before,
      after: { status: dto.status },
      ip: req.ip,
    });
    return updated;
  }
}
