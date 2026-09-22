import { Injectable } from "@nestjs/common";
import type { ModerationReasonCode } from "@kiro/types";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class ModerationService {
  constructor(private readonly prisma: PrismaService) {}

  /** Opens a PENDING case for a target (§53). Resolution (approve/reject) is Phase 10's admin queue. */
  async openCase(params: {
    targetType: string;
    targetId: string;
    reasonCode: ModerationReasonCode;
    details?: string;
  }) {
    return this.prisma.moderationCase.create({
      data: {
        targetType: params.targetType,
        targetId: params.targetId,
        reasonCode: params.reasonCode,
        details: params.details,
      },
    });
  }
}
