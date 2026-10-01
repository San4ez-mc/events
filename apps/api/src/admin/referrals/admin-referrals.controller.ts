import { Body, Controller, Get, Param, Patch, Query } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { Roles } from "../../common/decorators/roles.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import type { AuthenticatedUser } from "../../auth/types/authenticated-user";
import { ReferralsService } from "../../referrals/referrals.service";
import { ListReferralSubmissionsDto } from "../../referrals/dto/list-referral-submissions.dto";
import { ResolveReferralSubmissionDto } from "../../referrals/dto/resolve-referral-submission.dto";

/** §72 — approving a submission grants real credits, same sensitivity as `/admin/credits`, so ADMIN+ (not MODERATOR). */
@ApiTags("admin")
@Roles("ADMIN", "SUPER_ADMIN")
@Controller("admin/referrals")
export class AdminReferralsController {
  constructor(private readonly referralsService: ReferralsService) {}

  @Get()
  list(@Query() query: ListReferralSubmissionsDto) {
    return this.referralsService.list(query);
  }

  @Patch(":id/resolve")
  resolve(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Body() dto: ResolveReferralSubmissionDto) {
    return this.referralsService.resolve(user.id, id, dto);
  }
}
