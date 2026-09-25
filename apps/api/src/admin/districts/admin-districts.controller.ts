import { Body, Controller, Get, Param, Patch, Post, Query, Req } from "@nestjs/common";
import type { Request } from "express";
import { ApiTags } from "@nestjs/swagger";
import { Roles } from "../../common/decorators/roles.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import type { AuthenticatedUser } from "../../auth/types/authenticated-user";
import { GeographyService } from "../../geography/geography.service";
import { MergeDistrictDto } from "../dto/merge-district.dto";
import { UpdateDistrictDto } from "../dto/update-district.dto";

/** §72/§77. */
@ApiTags("admin")
@Roles("ADMIN", "SUPER_ADMIN")
@Controller("admin/districts")
export class AdminDistrictsController {
  constructor(private readonly geographyService: GeographyService) {}

  @Get()
  list(@Query("cityId") cityId?: string) {
    return this.geographyService.listAllDistrictsForAdmin(cityId);
  }

  @Patch(":id")
  update(@CurrentUser() admin: AuthenticatedUser, @Req() req: Request, @Param("id") id: string, @Body() dto: UpdateDistrictDto) {
    return this.geographyService.adminUpdateDistrict(admin.id, id, dto, req.ip);
  }

  @Post(":id/merge")
  merge(@CurrentUser() admin: AuthenticatedUser, @Param("id") id: string, @Body() dto: MergeDistrictDto) {
    return this.geographyService.mergeDistrict(admin.id, id, dto.targetDistrictId);
  }
}
