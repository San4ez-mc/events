import { Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { SYSTEM_SETTING_DEFAULTS, SystemSettingKey } from "@kiro/types";
import { PrismaService } from "../prisma/prisma.service";
import { ApiException } from "../common/exceptions/api.exception";
import { AuditLogService } from "../audit/audit-log.service";

const FREE_BONUS_SOURCE_TYPE = "FREE_ORGANIZER_BONUS";
export const EVENT_PUBLICATION_SOURCE_TYPE = "EVENT";
const ADMIN_ADJUSTMENT_SOURCE_TYPE = "ADMIN_ADJUSTMENT";

@Injectable()
export class CreditsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
  ) {}

  async getBalance(userId: string): Promise<number> {
    const result = await this.prisma.listingCreditLedger.aggregate({
      where: { userId },
      _sum: { creditsDelta: true },
    });
    return result._sum.creditsDelta ?? 0;
  }

  async getLedger(userId: string) {
    return this.prisma.listingCreditLedger.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
  }

  listPackages() {
    return this.prisma.creditPackage.findMany({
      where: { active: true },
      orderBy: { sortOrder: "asc" },
    });
  }

  /**
   * §36/§49 — "Take 5 free publications" is an explicit user action, not an
   * automatic grant, and must be idempotent: retrying (double-click, network
   * retry) must not grant twice. sourceType+sourceId is the dedup key, same
   * pattern as the publication debit below.
   */
  async claimFreeCredits(userId: string): Promise<{ granted: boolean; balance: number }> {
    const existing = await this.prisma.listingCreditLedger.findFirst({
      where: { userId, sourceType: FREE_BONUS_SOURCE_TYPE, sourceId: userId },
    });
    if (existing) {
      return { granted: false, balance: await this.getBalance(userId) };
    }

    const amount = await this.getFreeCreditsAmount();

    await this.prisma.listingCreditLedger.create({
      data: {
        userId,
        type: "GRANT",
        creditsDelta: amount,
        sourceType: FREE_BONUS_SOURCE_TYPE,
        sourceId: userId,
        description: "New organizer free publications bonus",
      },
    });

    return { granted: true, balance: await this.getBalance(userId) };
  }

  /**
   * §52 — the publication debit, meant to be called from inside the same
   * transaction as the event's status update (EventsService.publish passes
   * its transaction client through `tx`). Two safety properties:
   *
   *  - Idempotent: if this event was already charged (sourceType=EVENT,
   *    sourceId=eventId already has an EVENT_PUBLICATION row), this is a
   *    no-op that returns success rather than double-charging on a retried
   *    request (§98).
   *  - Race-safe: pg_advisory_xact_lock serializes concurrent publish
   *    attempts from the *same* user for the lifetime of the transaction,
   *    so two simultaneous publishes can't both read the same balance and
   *    both succeed, driving the balance negative. Scoped per-user (not a
   *    table-wide lock) so it doesn't serialize unrelated users' publishes
   *    against each other.
   */
  async debitForPublication(tx: Prisma.TransactionClient, userId: string, eventId: string): Promise<void> {
    // $executeRaw, not $queryRaw — pg_advisory_xact_lock returns void, and
    // $queryRaw tries to deserialize a typed result set from the response,
    // which fails on a void column.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${userId}))`;

    const alreadyCharged = await tx.listingCreditLedger.findFirst({
      where: { userId, sourceType: EVENT_PUBLICATION_SOURCE_TYPE, sourceId: eventId, type: "EVENT_PUBLICATION" },
    });
    if (alreadyCharged) return;

    const balanceResult = await tx.listingCreditLedger.aggregate({
      where: { userId },
      _sum: { creditsDelta: true },
    });
    const balance = balanceResult._sum.creditsDelta ?? 0;

    if (balance < 1) {
      throw new ApiException(
        "INSUFFICIENT_LISTING_CREDITS",
        "Not enough listing credits to publish this event",
        402,
      );
    }

    await tx.listingCreditLedger.create({
      data: {
        userId,
        type: "EVENT_PUBLICATION",
        creditsDelta: -1,
        sourceType: EVENT_PUBLICATION_SOURCE_TYPE,
        sourceId: eventId,
      },
    });
  }

  /**
   * §51 — credits a purchase once its `PlatformPaymentOrder` is confirmed
   * PAID. Takes the same transaction client as the order's own status
   * update (PaymentsService) so a payment can never end up marked PAID
   * without its credits landing, or vice versa. Idempotent the same way as
   * the other ledger writers: sourceType "PLATFORM_PAYMENT_ORDER" +
   * sourceId=orderId means a re-delivered webhook (providers retry on a
   * non-2xx or timeout) can never double-credit.
   */
  async grantForPurchase(
    tx: Prisma.TransactionClient,
    userId: string,
    credits: number,
    orderId: string,
  ): Promise<void> {
    const existing = await tx.listingCreditLedger.findFirst({
      where: { userId, sourceType: "PLATFORM_PAYMENT_ORDER", sourceId: orderId },
    });
    if (existing) return;

    await tx.listingCreditLedger.create({
      data: {
        userId,
        type: "PURCHASE",
        creditsDelta: credits,
        sourceType: "PLATFORM_PAYMENT_ORDER",
        sourceId: orderId,
        description: "Credit package purchase",
      },
    });
  }

  /** Phase 10's `/admin/credits` — a manual grant or deduction, always audited, always a fresh ledger row (never editing the balance directly). */
  async adminAdjust(adminId: string, userId: string, delta: number, description: string): Promise<number> {
    await this.prisma.listingCreditLedger.create({
      data: {
        userId,
        type: "ADMIN_ADJUSTMENT",
        creditsDelta: delta,
        sourceType: ADMIN_ADJUSTMENT_SOURCE_TYPE,
        sourceId: randomUUID(),
        description,
      },
    });
    const balance = await this.getBalance(userId);

    await this.auditLog.record({
      actorUserId: adminId,
      action: "CREDIT_ADJUSTMENT",
      entityType: "User",
      entityId: userId,
      after: { delta, description, newBalance: balance },
    });

    return balance;
  }

  private async getFreeCreditsAmount(): Promise<number> {
    const setting = await this.prisma.systemSetting.findUnique({
      where: { key: SystemSettingKey.NEW_ORGANIZER_FREE_CREDITS },
    });
    const value = setting?.valueJson;
    return typeof value === "number"
      ? value
      : (SYSTEM_SETTING_DEFAULTS[SystemSettingKey.NEW_ORGANIZER_FREE_CREDITS] as number);
  }
}
