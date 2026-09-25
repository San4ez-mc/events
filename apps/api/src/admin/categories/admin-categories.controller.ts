import { Body, Controller, Get, Param, Patch, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { Roles } from "../../common/decorators/roles.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import type { AuthenticatedUser } from "../../auth/types/authenticated-user";
import { CategoriesService } from "../../categories/categories.service";
import { MergeCategoryDto } from "../dto/merge-category.dto";
import { UpdateCategoryDto } from "../dto/update-category.dto";

/** §72/§76. */
@ApiTags("admin")
@Roles("ADMIN", "SUPER_ADMIN")
@Controller("admin/categories")
export class AdminCategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Get()
  list() {
    return this.categoriesService.listAllForAdmin();
  }

  @Patch(":id")
  update(@CurrentUser() admin: AuthenticatedUser, @Param("id") id: string, @Body() dto: UpdateCategoryDto) {
    return this.categoriesService.adminUpdate(admin.id, id, dto);
  }

  @Post(":id/merge")
  merge(@CurrentUser() admin: AuthenticatedUser, @Param("id") id: string, @Body() dto: MergeCategoryDto) {
    return this.categoriesService.merge(admin.id, id, dto.targetCategoryId);
  }
}
