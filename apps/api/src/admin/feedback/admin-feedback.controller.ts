import { Body, Controller, Get, Param, Patch, Query } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from "class-validator";
import { Type } from "class-transformer";
import { PAGINATION } from "@kiro/config";
import type { CursorPage } from "@kiro/types";
import { Roles } from "../../common/decorators/roles.decorator";
import { ResourceNotFoundException } from "../../common/exceptions/common-exceptions";
import { PrismaService } from "../../prisma/prisma.service";

const STATUSES = ["NEW", "RESOLVED"] as const;

export class ListFeedbackDto {
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

export class SetFeedbackStatusDto {
  @IsIn(STATUSES)
  status!: (typeof STATUSES)[number];
}

/** Problem reports sent from the app ("Повідомити про проблему розробнику"). Screenshots can show personal data, so ADMIN+ only. */
@ApiTags("admin")
@Roles("ADMIN", "SUPER_ADMIN")
@Controller("admin/feedback")
export class AdminFeedbackController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list(@Query() query: ListFeedbackDto): Promise<CursorPage<unknown> & { newCount: number }> {
    const limit = Math.min(query.limit ?? PAGINATION.defaultLimit, PAGINATION.maxLimit);
    const [rows, newCount] = await Promise.all([
      this.prisma.feedbackReport.findMany({
        where: query.status ? { status: query.status } : {},
        orderBy: { createdAt: "desc" },
        take: limit + 1,
        ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
        include: { user: { select: { id: true, name: true, nickname: true, email: true, avatarUrl: true } } },
      }),
      this.prisma.feedbackReport.count({ where: { status: "NEW" } }),
    ]);
    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    return { items, nextCursor: hasMore ? items[items.length - 1]!.id : null, hasMore, newCount };
  }

  @Patch(":id")
  async setStatus(@Param("id") id: string, @Body() dto: SetFeedbackStatusDto) {
    const existing = await this.prisma.feedbackReport.findUnique({ where: { id }, select: { id: true } });
    if (!existing) throw new ResourceNotFoundException("Report not found");
    return this.prisma.feedbackReport.update({
      where: { id },
      data: { status: dto.status, resolvedAt: dto.status === "RESOLVED" ? new Date() : null },
      include: { user: { select: { id: true, name: true, nickname: true, email: true, avatarUrl: true } } },
    });
  }
}
