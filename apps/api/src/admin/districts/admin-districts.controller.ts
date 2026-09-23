import { Body, Controller, Param, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { Roles } from "../../common/decorators/roles.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import type { AuthenticatedUser } from "../../auth/types/authenticated-user";
import { GeographyService } from "../../geography/geography.service";
import { MergeDistrictDto } from "../dto/merge-district.dto";

/** §72/§77. */
@ApiTags("admin")
@Roles("ADMIN", "SUPER_ADMIN")
@Controller("admin/districts")
export class AdminDistrictsController {
  constructor(private readonly geographyService: GeographyService) {}

  @Post(":id/merge")
  merge(@CurrentUser() admin: AuthenticatedUser, @Param("id") id: string, @Body() dto: MergeDistrictDto) {
    return this.geographyService.mergeDistrict(admin.id, id, dto.targetDistrictId);
  }
}
