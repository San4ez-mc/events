import { Controller, Get, HttpCode, HttpStatus, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { Public } from "../common/decorators/public.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import type { AuthenticatedUser } from "../auth/types/authenticated-user";
import { CreditsService } from "./credits.service";

@ApiTags("credits")
@Controller("credits")
export class CreditsController {
  constructor(private readonly creditsService: CreditsService) {}

  @Get("balance")
  async getBalance(@CurrentUser() user: AuthenticatedUser) {
    return { balance: await this.creditsService.getBalance(user.id) };
  }

  @Get("ledger")
  getLedger(@CurrentUser() user: AuthenticatedUser) {
    return this.creditsService.getLedger(user.id);
  }

  /** §50 — prices live in the DB, never hardcoded in a frontend. */
  @Public()
  @Get("packages")
  listPackages() {
    return this.creditsService.listPackages();
  }

  @HttpCode(HttpStatus.OK)
  @Post("claim-free")
  claimFree(@CurrentUser() user: AuthenticatedUser) {
    return this.creditsService.claimFreeCredits(user.id);
  }
}
