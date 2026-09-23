import { Injectable } from "@nestjs/common";
import type { PaymentProvider } from "@kiro/types";
import { PrismaService } from "../prisma/prisma.service";
import { ApiException } from "../common/exceptions/api.exception";
import { ResourceNotFoundException } from "../common/exceptions/common-exceptions";
import { CreditsService } from "../credits/credits.service";
import { WayForPayAdapter } from "./providers/wayforpay.adapter";
import { MonoAdapter } from "./providers/mono.adapter";
import { ManualIbanAdapter } from "./providers/manual-iban.adapter";
import type { PaymentProviderAdapter } from "./providers/payment-provider.interface";
import type { CreateOrderDto } from "./dto/create-order.dto";

/** §51 — buying listing-credit packages with real money. Never mixed with event-ticket payments (Event.paymentUrl). */
@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly creditsService: CreditsService,
    private readonly wayForPay: WayForPayAdapter,
    private readonly mono: MonoAdapter,
    private readonly manualIban: ManualIbanAdapter,
  ) {}

  private adapterFor(provider: PaymentProvider): PaymentProviderAdapter {
    switch (provider) {
      case "WAYFORPAY":
        return this.wayForPay;
      case "MONO":
        return this.mono;
      case "MANUAL_IBAN":
        return this.manualIban;
    }
  }

  async createOrder(userId: string, dto: CreateOrderDto) {
    const pkg = await this.prisma.creditPackage.findUnique({ where: { id: dto.packageId } });
    if (!pkg || !pkg.active) throw new ResourceNotFoundException("Package not found");

    const order = await this.prisma.platformPaymentOrder.create({
      data: {
        userId,
        packageId: pkg.id,
        provider: dto.provider,
        amount: pkg.price,
        currency: pkg.currency,
      },
    });

    const adapter = this.adapterFor(dto.provider);
    const checkout = await adapter.createCheckout({
      id: order.id,
      amount: pkg.price.toString(),
      currency: pkg.currency,
      package: { name: pkg.name, credits: pkg.credits },
    });

    if (checkout.providerReference) {
      await this.prisma.platformPaymentOrder.update({
        where: { id: order.id },
        data: { providerReference: checkout.providerReference },
      });
    }

    return { order, checkout };
  }

  async listMine(userId: string) {
    return this.prisma.platformPaymentOrder.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      include: { package: true },
    });
  }

  /** Phase 10's `/admin/payments` — every order, any user. */
  async listAll() {
    return this.prisma.platformPaymentOrder.findMany({
      orderBy: { createdAt: "desc" },
      take: 200,
      include: { package: true, user: { select: { id: true, name: true, nickname: true, email: true } } },
    });
  }

  /**
   * §51 — verify-then-trust. The webhook body is attacker-controlled input
   * until `verifyWebhook` passes; only then is `parseWebhook`'s result acted
   * on. Silently no-ops on an unknown order id or one that's already past
   * PENDING — a provider's retried delivery must never double-credit (§98).
   */
  async handleWebhook(
    provider: PaymentProvider,
    rawBody: Buffer,
    headers: Record<string, string | string[] | undefined>,
  ): Promise<void> {
    const adapter = this.adapterFor(provider);
    const valid = await adapter.verifyWebhook(rawBody, headers);
    if (!valid) {
      throw new ApiException("VALIDATION_ERROR", "Invalid webhook signature", 400);
    }

    const outcome = adapter.parseWebhook(rawBody);
    const order = await this.prisma.platformPaymentOrder.findUnique({ where: { id: outcome.orderId } });
    if (!order || order.status !== "PENDING") return;

    if (outcome.status === "PAID") {
      const pkg = await this.prisma.creditPackage.findUniqueOrThrow({ where: { id: order.packageId } });
      await this.prisma.$transaction(async (tx) => {
        await tx.platformPaymentOrder.update({
          where: { id: order.id },
          data: { status: "PAID", paidAt: new Date(), providerReference: outcome.providerReference },
        });
        await this.creditsService.grantForPurchase(tx, order.userId, pkg.credits, order.id);
      });
    } else {
      await this.prisma.platformPaymentOrder.update({ where: { id: order.id }, data: { status: "FAILED" } });
    }
  }

  /** Admin-only (Phase 10's `/admin/payments`) — the manual IBAN provider has no webhook to confirm itself. */
  async confirmManual(orderId: string) {
    const order = await this.prisma.platformPaymentOrder.findUnique({ where: { id: orderId } });
    if (!order) throw new ResourceNotFoundException("Order not found");
    if (order.provider !== "MANUAL_IBAN") {
      throw new ApiException("VALIDATION_ERROR", "Only manual IBAN orders are confirmed this way", 400);
    }
    if (order.status !== "PENDING") return order;

    const pkg = await this.prisma.creditPackage.findUniqueOrThrow({ where: { id: order.packageId } });
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.platformPaymentOrder.update({
        where: { id: order.id },
        data: { status: "PAID", paidAt: new Date() },
      });
      await this.creditsService.grantForPurchase(tx, order.userId, pkg.credits, order.id);
      return updated;
    });
  }
}
