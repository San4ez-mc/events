import { Body, Controller, Get, Param, Patch, Post, Put, Query } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import type { AuthenticatedUser } from "../auth/types/authenticated-user";
import { RegistrationsService } from "./registrations.service";
import { CreateRegistrationDto } from "./dto/create-registration.dto";
import { ListRegistrationsDto } from "./dto/list-registrations.dto";
import { RejectRegistrationDto } from "./dto/reject-registration.dto";
import { SetRegistrationFieldsDto } from "./dto/set-registration-fields.dto";

/** The event-scoped half of the registration flow: attendee sign-up + organizer management. */
@ApiTags("registrations")
@Controller("events/:eventId/registrations")
export class EventRegistrationsController {
  constructor(private readonly registrationsService: RegistrationsService) {}

  @Post()
  register(
    @CurrentUser() user: AuthenticatedUser,
    @Param("eventId") eventId: string,
    @Body() dto: CreateRegistrationDto,
  ) {
    return this.registrationsService.register(eventId, user.id, dto);
  }

  /**
   * Wrapped in `{ registration }` rather than returning the value bare:
   * Nest sends a Nest handler's literal `null` return as an *empty* HTTP
   * body (not the JSON text "null"), which a plain `res.json()` call
   * wouldn't do — a bare-null response is indistinguishable from no body at
   * all client-side, so "not registered" needs an explicit wrapper.
   */
  @Get("me")
  async getMine(@CurrentUser() user: AuthenticatedUser, @Param("eventId") eventId: string) {
    return { registration: await this.registrationsService.getMine(eventId, user.id) };
  }

  @Get()
  listForEvent(
    @CurrentUser() user: AuthenticatedUser,
    @Param("eventId") eventId: string,
    @Query() query: ListRegistrationsDto,
  ) {
    return this.registrationsService.listForEvent(eventId, user.id, query);
  }

  @Patch(":id/approve")
  approve(@CurrentUser() user: AuthenticatedUser, @Param("eventId") eventId: string, @Param("id") id: string) {
    return this.registrationsService.approve(eventId, id, user.id);
  }

  @Patch(":id/reject")
  reject(
    @CurrentUser() user: AuthenticatedUser,
    @Param("eventId") eventId: string,
    @Param("id") id: string,
    @Body() dto: RejectRegistrationDto,
  ) {
    return this.registrationsService.reject(eventId, id, user.id, dto);
  }

  @Patch(":id/confirm-payment")
  confirmPayment(@CurrentUser() user: AuthenticatedUser, @Param("eventId") eventId: string, @Param("id") id: string) {
    return this.registrationsService.confirmPayment(eventId, id, user.id);
  }

  @Put("fields")
  setFields(
    @CurrentUser() user: AuthenticatedUser,
    @Param("eventId") eventId: string,
    @Body() dto: SetRegistrationFieldsDto,
  ) {
    return this.registrationsService.setFields(eventId, user.id, dto);
  }
}
