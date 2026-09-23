import { Injectable } from "@nestjs/common";
import { PAGINATION } from "@kiro/config";
import type { CursorPage } from "@kiro/types";
import { PrismaService } from "../../prisma/prisma.service";
import { ResourceNotFoundException } from "../../common/exceptions/common-exceptions";
import type { AdminListEventsDto } from "../dto/admin-list-events.dto";

/** §72/§74 — the admin's view of every event, any status/owner. */
@Injectable()
export class AdminEventsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: AdminListEventsDto): Promise<CursorPage<unknown>> {
    const limit = Math.min(query.limit ?? PAGINATION.defaultLimit, PAGINATION.maxLimit);
    const events = await this.prisma.event.findMany({
      where: {
        status: query.status,
        ...(query.search ? { title: { contains: query.search, mode: "insensitive" } } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      include: {
        media: { orderBy: { sortOrder: "asc" }, take: 1 },
        owner: { select: { id: true, name: true, nickname: true, email: true } },
      },
    });
    const hasMore = events.length > limit;
    const items = hasMore ? events.slice(0, limit) : events;
    return { items, nextCursor: hasMore ? items[items.length - 1]!.id : null, hasMore };
  }

  async getOne(eventId: string) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      include: {
        media: { orderBy: { sortOrder: "asc" } },
        category: true,
        city: true,
        district: true,
        owner: { select: { id: true, name: true, nickname: true, email: true } },
      },
    });
    if (!event) throw new ResourceNotFoundException("Event not found");
    return event;
  }
}
