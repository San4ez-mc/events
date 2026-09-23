import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import type { AuthenticatedUser } from "../auth/types/authenticated-user";
import { CollaboratorsService } from "./collaborators.service";
import { AddCollaboratorDto } from "./dto/add-collaborator.dto";
import { UpdateCollaboratorDto } from "./dto/update-collaborator.dto";

@ApiTags("collaborators")
@Controller("events/:eventId/collaborators")
export class CollaboratorsController {
  constructor(private readonly collaboratorsService: CollaboratorsService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Param("eventId") eventId: string) {
    return this.collaboratorsService.list(eventId, user.id);
  }

  @Post()
  add(@CurrentUser() user: AuthenticatedUser, @Param("eventId") eventId: string, @Body() dto: AddCollaboratorDto) {
    return this.collaboratorsService.add(eventId, user.id, dto);
  }

  @Patch(":id")
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param("eventId") eventId: string,
    @Param("id") id: string,
    @Body() dto: UpdateCollaboratorDto,
  ) {
    return this.collaboratorsService.update(eventId, user.id, id, dto);
  }

  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete(":id")
  remove(@CurrentUser() user: AuthenticatedUser, @Param("eventId") eventId: string, @Param("id") id: string) {
    return this.collaboratorsService.remove(eventId, user.id, id);
  }
}
