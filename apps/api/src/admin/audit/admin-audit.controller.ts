import { Controller, Get, Query } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { IsInt, IsOptional, IsString, Max, Min } from "class-validator";
import { Type } from "class-transformer";
import { PAGINATION } from "@kiro/config";
import { Roles } from "../../common/decorators/roles.decorator";
import { AuditLogService } from "../../audit/audit-log.service";

class ListAuditLogDto {
  @IsOptional()
  @IsString()
  entityType?: string;

  @IsOptional()
  @IsString()
  actorUserId?: string;

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

/** §72/§75. */
@ApiTags("admin")
@Roles("ADMIN", "SUPER_ADMIN")
@Controller("admin/audit")
export class AdminAuditController {
  constructor(private readonly auditLog: AuditLogService) {}

  @Get()
  list(@Query() query: ListAuditLogDto) {
    return this.auditLog.list({ ...query, limit: query.limit ?? PAGINATION.defaultLimit });
  }
}
