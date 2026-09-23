import { Body, Controller, Get, Param, Patch, Query } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { Roles } from "../../common/decorators/roles.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import type { AuthenticatedUser } from "../../auth/types/authenticated-user";
import { UsersService } from "../../users/users.service";
import { AdminListUsersDto } from "../../users/dto/admin-list-users.dto";
import { SetUserStatusDto } from "../dto/set-user-status.dto";
import { SetUserRoleDto } from "../dto/set-user-role.dto";

/** §72/§73 — user management is ADMIN+ (not MODERATOR); role changes are further restricted to SUPER_ADMIN below. */
@ApiTags("admin")
@Roles("ADMIN", "SUPER_ADMIN")
@Controller("admin/users")
export class AdminUsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  list(@Query() query: AdminListUsersDto) {
    return this.usersService.adminList(query);
  }

  @Get(":id")
  getOne(@Param("id") id: string) {
    return this.usersService.adminGetOne(id);
  }

  @Patch(":id/status")
  setStatus(@CurrentUser() admin: AuthenticatedUser, @Param("id") id: string, @Body() dto: SetUserStatusDto) {
    return this.usersService.adminSetStatus(admin.id, id, dto.status);
  }

  @Roles("SUPER_ADMIN")
  @Patch(":id/role")
  setRole(@CurrentUser() admin: AuthenticatedUser, @Param("id") id: string, @Body() dto: SetUserRoleDto) {
    return this.usersService.adminSetRole(admin.id, id, dto.role);
  }
}
