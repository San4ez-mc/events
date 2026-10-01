import { Body, Controller, Get, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import type { AuthenticatedUser } from "../auth/types/authenticated-user";
import { ReferralsService } from "./referrals.service";
import { CreateReferralSubmissionDto } from "./dto/create-referral-submission.dto";
import { RateLimit } from "../common/throttle";

/** Marketing §referral — the user-facing half. Reviewing one is `/admin/referrals` (AdminReferralsController). */
@ApiTags("referrals")
@Controller("referrals")
export class ReferralsController {
  constructor(private readonly referralsService: ReferralsService) {}

  @RateLimit(10)
  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateReferralSubmissionDto) {
    return this.referralsService.create(user.id, dto);
  }

  @Get("mine")
  listMine(@CurrentUser() user: AuthenticatedUser) {
    return this.referralsService.listMine(user.id);
  }
}
