import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { ForbiddenActionException, ResourceNotFoundException } from "../common/exceptions/common-exceptions";
import type { UpsertNoteDto } from "./dto/upsert-note.dto";

/**
 * §36 — private notes an author (typically an organizer) keeps about
 * another user. Every method here is scoped to the calling author; there is
 * deliberately no way to fetch notes written *about* the caller — "API
 * ніколи не повертає private note target user-у" (§36).
 */
@Injectable()
export class NotesService {
  constructor(private readonly prisma: PrismaService) {}

  async upsert(authorUserId: string, targetUserId: string, dto: UpsertNoteDto) {
    const existing = await this.prisma.privateUserNote.findFirst({
      where: { authorUserId, targetUserId, eventId: dto.eventId ?? null },
    });
    if (existing) {
      return this.prisma.privateUserNote.update({ where: { id: existing.id }, data: { note: dto.note } });
    }
    return this.prisma.privateUserNote.create({
      data: { authorUserId, targetUserId, eventId: dto.eventId, note: dto.note },
    });
  }

  async listAboutUser(authorUserId: string, targetUserId: string) {
    return this.prisma.privateUserNote.findMany({
      where: { authorUserId, targetUserId },
      orderBy: { updatedAt: "desc" },
    });
  }

  async remove(authorUserId: string, noteId: string): Promise<void> {
    const note = await this.prisma.privateUserNote.findUnique({ where: { id: noteId } });
    if (!note) throw new ResourceNotFoundException("Note not found");
    if (note.authorUserId !== authorUserId) throw new ForbiddenActionException();
    await this.prisma.privateUserNote.delete({ where: { id: noteId } });
  }
}
