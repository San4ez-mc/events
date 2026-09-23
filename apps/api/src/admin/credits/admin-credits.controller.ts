import { Body, Controller, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { Roles } from "../../common/decorators/roles.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import type { AuthenticatedUser } from "../../auth/types/authenticated-user";
import { CreditsService } from "../../credits/credits.service";
import { AdjustCreditsDto } from "../dto/adjust-credits.dto";

/** §72/§48 — a manual grant or deduction on a user's listing-credit ledger. */
@ApiTags("admin")
@Roles("ADMIN", "SUPER_ADMIN")
@Controller("admin/credits")
export class AdminCreditsController {
  constructor(private readonly creditsService: CreditsService) {}

  @Post("adjust")
  async adjust(@CurrentUser() admin: AuthenticatedUser, @Body() dto: AdjustCreditsDto) {
    const balance = await this.creditsService.adminAdjust(admin.id, dto.userId, dto.delta, dto.description);
    return { userId: dto.userId, balance };
  }
}
