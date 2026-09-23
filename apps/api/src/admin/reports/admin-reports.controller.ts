import { Body, Controller, Get, Param, Patch, Query } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { Roles } from "../../common/decorators/roles.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import type { AuthenticatedUser } from "../../auth/types/authenticated-user";
import { ReportsService } from "../../reports/reports.service";
import { ListReportsDto } from "../../reports/dto/list-reports.dto";
import { ResolveReportDto } from "../../reports/dto/resolve-report.dto";

/** §72/§73 — MODERATOR and above ("reports" is explicitly in MODERATOR's scope). */
@ApiTags("admin")
@Roles("MODERATOR", "ADMIN", "SUPER_ADMIN")
@Controller("admin/reports")
export class AdminReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get()
  list(@Query() query: ListReportsDto) {
    return this.reportsService.list(query);
  }

  @Patch(":id/resolve")
  resolve(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Body() dto: ResolveReportDto) {
    return this.reportsService.resolve(user.id, id, dto);
  }
}
