import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Put } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import type { AuthenticatedUser } from "../auth/types/authenticated-user";
import { NotesService } from "./notes.service";
import { UpsertNoteDto } from "./dto/upsert-note.dto";

@ApiTags("notes")
@Controller("users/:userId/notes")
export class NotesController {
  constructor(private readonly notesService: NotesService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Param("userId") userId: string) {
    return this.notesService.listAboutUser(user.id, userId);
  }

  @Put()
  upsert(@CurrentUser() user: AuthenticatedUser, @Param("userId") userId: string, @Body() dto: UpsertNoteDto) {
    return this.notesService.upsert(user.id, userId, dto);
  }

  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete(":noteId")
  remove(@CurrentUser() user: AuthenticatedUser, @Param("noteId") noteId: string) {
    return this.notesService.remove(user.id, noteId);
  }
}
