import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { EnvConfig } from "../../config/env.validation";
import type { CheckoutInstructions, PayableOrder, PaymentProviderAdapter, WebhookOutcome } from "./payment-provider.interface";

/**
 * §51 — bank-transfer fallback. There's no webhook: a human pays by IBAN
 * transfer with the order id as the payment reference, and an admin confirms
 * it manually once it lands (`PaymentsService.confirmManual`, Phase 10's
 * `/admin/payments` surface). `verifyWebhook`/`parseWebhook` are never called
 * for this provider — the controller never routes it there.
 */
@Injectable()
export class ManualIbanAdapter implements PaymentProviderAdapter {
  constructor(private readonly configService: ConfigService<EnvConfig, true>) {}

  async createCheckout(order: PayableOrder): Promise<CheckoutInstructions> {
    const iban = this.configService.get("MANUAL_IBAN", { infer: true });
    const recipient = this.configService.get("MANUAL_IBAN_RECIPIENT", { infer: true });
    return {
      instructions: `Transfer ${order.amount} ${order.currency} to ${recipient}, IBAN ${iban}. Payment reference: ${order.id}.`,
    };
  }

  async verifyWebhook(): Promise<boolean> {
    return false;
  }

  parseWebhook(): WebhookOutcome {
    throw new Error("Manual IBAN payments have no webhook — confirm them via PaymentsService.confirmManual instead");
  }
}
