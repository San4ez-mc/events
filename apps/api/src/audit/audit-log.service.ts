import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

/** §74/§75 — every admin mutation must leave an `audit_logs` row. */
@Injectable()
export class AuditLogService {
  constructor(private readonly prisma: PrismaService) {}

  async record(params: {
    actorUserId: string;
    action: string;
    entityType: string;
    entityId: string;
    before?: unknown;
    after?: unknown;
    ip?: string;
  }): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        actorUserId: params.actorUserId,
        action: params.action,
        entityType: params.entityType,
        entityId: params.entityId,
        beforeJson: params.before as Prisma.InputJsonValue | undefined,
        afterJson: params.after as Prisma.InputJsonValue | undefined,
        ip: params.ip,
      },
    });
  }

  async list(params: { entityType?: string; actorUserId?: string; cursor?: string; limit: number }) {
    const items = await this.prisma.auditLog.findMany({
      where: { entityType: params.entityType, actorUserId: params.actorUserId },
      orderBy: { createdAt: "desc" },
      take: params.limit + 1,
      ...(params.cursor ? { cursor: { id: params.cursor }, skip: 1 } : {}),
      include: { actor: { select: { id: true, name: true, nickname: true, email: true } } },
    });
    const hasMore = items.length > params.limit;
    const page = hasMore ? items.slice(0, params.limit) : items;
    return { items: page, nextCursor: hasMore ? page[page.length - 1]!.id : null, hasMore };
  }
}
