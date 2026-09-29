import { Injectable, Logger } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { SUBSCRIPTION_TIERS } from "@kiro/config";
import type { SubscriptionTier } from "@kiro/types";
import { PrismaService } from "../prisma/prisma.service";
import { ApiException } from "../common/exceptions/api.exception";
import { AuditLogService } from "../audit/audit-log.service";
import { GooglePlayVerifier, type PlayPurchaseState } from "./google-play.verifier";
import type { VerifyPurchaseDto } from "./dto/verify-purchase.dto";
import type { AdminSetSubscriptionDto } from "../admin/dto/admin-set-subscription.dto";

const PRODUCT_ID_TO_TIER: Record<string, SubscriptionTier> = {
  [SUBSCRIPTION_TIERS.STARTER.productId]: "STARTER",
  [SUBSCRIPTION_TIERS.PRO.productId]: "PRO",
};

/** Google's subscriptionsv2 states that still mean "the user has access right now" (grace period included — §51 never revokes access mid-dispute). */
const ACTIVE_STATES = new Set(["SUBSCRIPTION_STATE_ACTIVE", "SUBSCRIPTION_STATE_IN_GRACE_PERIOD"]);

export interface CurrentSubscription {
  tier: SubscriptionTier | null;
  status: "ACTIVE" | "GRACE_PERIOD" | null;
  expiresAt: string | null;
  autoRenewing: boolean;
}

/**
 * Organizer subscriptions (STARTER/PRO) — via Google Play Billing (Android, auto-renewing) or a
 * one-off WayForPay/Mono web payment (manually renewed month by month). Jobs: verify a purchase/
 * renewal and grant that period's credits, answer "what plan is this user on" (cheap — reads the
 * denormalized User.subscriptionTier/subscriptionExpiresAt), and gate the two PRO-only features
 * (co-organizers, recurring events) for every other module to call into.
 */
@Injectable()
export class PlatformSubscriptionsService {
  private readonly logger = new Logger(PlatformSubscriptionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
    private readonly playVerifier: GooglePlayVerifier,
  ) {}

  async getMine(userId: string): Promise<CurrentSubscription> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { subscriptionTier: true, subscriptionExpiresAt: true },
    });
    if (!user.subscriptionTier) return { tier: null, status: null, expiresAt: null, autoRenewing: false };
    const row = await this.prisma.platformSubscription.findFirst({
      where: { userId, status: { in: ["ACTIVE", "GRACE_PERIOD"] } },
      orderBy: { startedAt: "desc" },
    });
    return {
      tier: user.subscriptionTier,
      status: row?.status === "GRACE_PERIOD" ? "GRACE_PERIOD" : "ACTIVE",
      expiresAt: user.subscriptionExpiresAt?.toISOString() ?? null,
      autoRenewing: row?.autoRenewing ?? false,
    };
  }

  /** Throws SUBSCRIPTION_REQUIRED (403) unless the user currently has an active/grace-period PRO plan. */
  async assertPro(userId: string): Promise<void> {
    const current = await this.getMine(userId);
    if (current.tier !== "PRO") {
      throw new ApiException("SUBSCRIPTION_REQUIRED", "This feature needs the Pro subscription", 403);
    }
  }

  /** Called by the mobile app right after react-native-iap resolves a purchase. Idempotent: re-verifying the same token just re-syncs, never double-grants. */
  async verifyPurchase(userId: string, dto: VerifyPurchaseDto): Promise<CurrentSubscription> {
    const tier = PRODUCT_ID_TO_TIER[dto.productId];
    if (!tier) throw new ApiException("VALIDATION_ERROR", "Unknown subscription product", 400);
    const state = await this.playVerifier.getSubscription(dto.purchaseToken);
    await this.applyGoogleState(userId, tier, dto.productId, dto.purchaseToken, state);
    return this.getMine(userId);
  }

  /**
   * A web (WayForPay/Mono) subscription purchase — called from PaymentsService once a
   * PlatformPaymentOrder for a subscription tier is confirmed PAID. Unlike Google Play, there's no
   * card-on-file recurring charge wired up: this activates exactly one paid month, extending from the
   * current expiry if the user still has time left (early renewal), otherwise starting from now.
   * Upserts on purchaseToken=orderId so a retried webhook delivery re-activates idempotently.
   */
  async activateFromWebPayment(userId: string, tier: SubscriptionTier, provider: "WAYFORPAY" | "MONO", orderId: string): Promise<void> {
    const current = await this.prisma.platformSubscription.findFirst({
      where: { userId, status: { in: ["ACTIVE", "GRACE_PERIOD"] } },
      orderBy: { startedAt: "desc" },
    });
    const base = current?.expiresAt && current.expiresAt.getTime() > Date.now() ? current.expiresAt : new Date();
    const expiresAt = new Date(base.getTime() + 30 * 24 * 60 * 60 * 1000);

    const row = await this.prisma.platformSubscription.upsert({
      where: { purchaseToken: orderId },
      create: { userId, tier, status: "ACTIVE", provider, purchaseToken: orderId, startedAt: new Date(), expiresAt, autoRenewing: false },
      update: {},
    });

    await this.syncUserFields(userId);
    await this.grantMonthlyCredits(row.id, userId, tier);
  }

  /** Hourly (SubscriptionRecheckScheduler) — web subscriptions never auto-renew, so a lapsed one just needs its status flipped and its user re-synced. */
  async expireLapsedWebSubscriptions(): Promise<void> {
    const lapsed = await this.prisma.platformSubscription.findMany({
      where: { provider: { in: ["WAYFORPAY", "MONO"] }, status: "ACTIVE", expiresAt: { lte: new Date() } },
      select: { id: true, userId: true },
    });
    for (const { id, userId } of lapsed) {
      await this.prisma.platformSubscription.update({ where: { id }, data: { status: "EXPIRED" } });
      await this.syncUserFields(userId);
    }
  }

  /** Periodic recheck (SubscriptionRecheckScheduler) — Play renewals/cancellations only surface here, not pushed to us (no RTDN webhook yet). */
  async recheckGoogleSubscription(subscriptionId: string): Promise<void> {
    const row = await this.prisma.platformSubscription.findUniqueOrThrow({ where: { id: subscriptionId } });
    if (row.provider !== "GOOGLE_PLAY" || !row.purchaseToken) return;
    try {
      const state = await this.playVerifier.getSubscription(row.purchaseToken);
      await this.applyGoogleState(row.userId, row.tier, row.productId ?? "", row.purchaseToken, state);
    } catch (err) {
      this.logger.warn(`recheck failed for subscription ${subscriptionId}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  private async applyGoogleState(userId: string, tier: SubscriptionTier, productId: string, purchaseToken: string, state: PlayPurchaseState): Promise<void> {
    const isActive = ACTIVE_STATES.has(state.state);
    const status = !isActive ? "EXPIRED" : state.state === "SUBSCRIPTION_STATE_IN_GRACE_PERIOD" ? "GRACE_PERIOD" : "ACTIVE";
    const expiresAt = new Date(state.expiryTime);

    const row = await this.prisma.platformSubscription.upsert({
      where: { purchaseToken },
      create: { userId, tier, status, provider: "GOOGLE_PLAY", purchaseToken, productId, startedAt: new Date(), expiresAt, autoRenewing: state.autoRenewing },
      update: { status, expiresAt, autoRenewing: state.autoRenewing },
    });

    await this.syncUserFields(userId);
    if (isActive) await this.grantMonthlyCredits(row.id, userId, tier);
  }

  /** Grants the tier's monthly credits once per calendar period (yyyy-mm) — re-verifying/rechecking mid-period is a no-op. */
  private async grantMonthlyCredits(subscriptionId: string, userId: string, tier: SubscriptionTier): Promise<void> {
    const period = new Date().toISOString().slice(0, 7); // yyyy-mm
    const sourceId = `${subscriptionId}:${period}`;
    const already = await this.prisma.listingCreditLedger.findFirst({ where: { sourceType: "SUBSCRIPTION_GRANT", sourceId } });
    if (already) return;

    await this.prisma.$transaction([
      this.prisma.listingCreditLedger.create({
        data: {
          userId,
          type: "GRANT",
          creditsDelta: SUBSCRIPTION_TIERS[tier].monthlyCredits,
          sourceType: "SUBSCRIPTION_GRANT",
          sourceId,
          description: `${tier} subscription — ${period}`,
        },
      }),
      this.prisma.platformSubscription.update({ where: { id: subscriptionId }, data: { lastCreditGrantPeriod: period } }),
    ]);
  }

  /** Keeps User.subscriptionTier/subscriptionExpiresAt pointed at whichever row (any provider) is the user's current one. */
  private async syncUserFields(userId: string, tx: Prisma.TransactionClient | PrismaService = this.prisma): Promise<void> {
    const current = await tx.platformSubscription.findFirst({
      where: { userId, status: { in: ["ACTIVE", "GRACE_PERIOD"] } },
      orderBy: { startedAt: "desc" },
    });
    await tx.user.update({
      where: { id: userId },
      data: { subscriptionTier: current?.tier ?? null, subscriptionExpiresAt: current?.expiresAt ?? null },
    });
  }

  /** Admin support/testing tool — sets or revokes a plan by hand, bypassing Google Play. Audit-logged like every admin mutation (§74). */
  async adminSet(adminId: string, userId: string, dto: AdminSetSubscriptionDto): Promise<CurrentSubscription> {
    const before = await this.getMine(userId);

    await this.prisma.$transaction(async (tx) => {
      const existing = await tx.platformSubscription.findFirst({
        where: { userId, provider: "ADMIN_GRANT", status: { in: ["ACTIVE", "GRACE_PERIOD"] } },
        orderBy: { startedAt: "desc" },
      });
      if (existing) await tx.platformSubscription.update({ where: { id: existing.id }, data: { status: "CANCELLED" } });

      if (dto.tier) {
        await tx.platformSubscription.create({
          data: {
            userId,
            tier: dto.tier,
            status: "ACTIVE",
            provider: "ADMIN_GRANT",
            startedAt: new Date(),
            expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
            grantedByAdminId: adminId,
          },
        });
      }
      await this.syncUserFields(userId, tx);
    });

    const after = await this.getMine(userId);
    await this.auditLog.record({ actorUserId: adminId, action: "SUBSCRIPTION_SET", entityType: "USER", entityId: userId, before, after });
    return after;
  }
}
