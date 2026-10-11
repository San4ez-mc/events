import { Controller, Get, HttpCode, HttpStatus, Param, Patch, Query } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import type { AuthenticatedUser } from "../auth/types/authenticated-user";
import { RegistrationsService } from "./registrations.service";
import { ListRegistrationsDto } from "./dto/list-registrations.dto";

/** The attendee-scoped half of the registration flow — actions on a registration the caller owns. */
@ApiTags("registrations")
@Controller("registrations")
export class RegistrationsController {
  constructor(private readonly registrationsService: RegistrationsService) {}

  @Get("mine")
  listMine(@CurrentUser() user: AuthenticatedUser, @Query() query: ListRegistrationsDto) {
    return this.registrationsService.listMine(user.id, query);
  }

  @HttpCode(HttpStatus.OK)
  @Patch(":id/cancel")
  cancel(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.registrationsService.cancel(id, user.id);
  }

  /** The "Ви ще йдете?" answer: yes, I'm still coming. (Saying no is the existing cancel.) */
  @HttpCode(HttpStatus.OK)
  @Patch(":id/confirm-attendance")
  confirmAttendance(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.registrationsService.confirmAttendance(id, user.id);
  }

  @HttpCode(HttpStatus.OK)
  @Patch(":id/mark-paid")
  markPaid(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.registrationsService.markPaid(id, user.id);
  }
}
