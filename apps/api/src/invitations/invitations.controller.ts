import { Body, Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import type { AuthenticatedUser } from "../auth/types/authenticated-user";
import { InvitationsService } from "./invitations.service";
import { InviteParticipantDto } from "./dto/invite-participant.dto";
import { SearchCandidatesDto } from "./dto/search-candidates.dto";

@ApiTags("invitations")
@Controller()
export class InvitationsController {
  constructor(private readonly invitationsService: InvitationsService) {}

  @Get("events/:eventId/invitations/candidates")
  searchCandidates(
    @CurrentUser() user: AuthenticatedUser,
    @Param("eventId") eventId: string,
    @Query() query: SearchCandidatesDto,
  ) {
    return this.invitationsService.searchCandidates(eventId, user.id, query);
  }

  @Post("events/:eventId/invitations")
  invite(
    @CurrentUser() user: AuthenticatedUser,
    @Param("eventId") eventId: string,
    @Body() dto: InviteParticipantDto,
  ) {
    return this.invitationsService.invite(eventId, user.id, dto.inviteeUserId);
  }

  @Get("invitations/mine")
  listMine(@CurrentUser() user: AuthenticatedUser) {
    return this.invitationsService.listMine(user.id);
  }

  @Patch("invitations/:id/accept")
  accept(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.invitationsService.respond(id, user.id, "ACCEPTED");
  }

  @Patch("invitations/:id/decline")
  decline(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.invitationsService.respond(id, user.id, "DECLINED");
  }
}
