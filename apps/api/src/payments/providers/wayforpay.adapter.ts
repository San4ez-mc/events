import { Injectable } from "@nestjs/common";
import { createHmac } from "node:crypto";
import { ConfigService } from "@nestjs/config";
import type { EnvConfig } from "../../config/env.validation";
import type { CheckoutInstructions, PayableOrder, PaymentProviderAdapter, WebhookOutcome } from "./payment-provider.interface";

const PAY_URL = "https://secure.wayforpay.com/pay";

/**
 * §51 — WayForPay's "Purchase" widget. No server-to-server call is needed to
 * start a checkout: the merchant signs a fixed field set locally
 * (HMAC_MD5 over `;`-joined values, per WayForPay's documented algorithm)
 * and sends the browser to their pay page with those fields; WayForPay signs
 * its own webhook callback the same way, which is what `verifyWebhook`
 * recomputes and compares.
 */
@Injectable()
export class WayForPayAdapter implements PaymentProviderAdapter {
  private readonly merchantAccount: string;
  private readonly secretKey: string;
  private readonly domainName: string;

  constructor(configService: ConfigService<EnvConfig, true>) {
    this.merchantAccount = configService.get("WAYFORPAY_MERCHANT_ACCOUNT", { infer: true });
    this.secretKey = configService.get("WAYFORPAY_MERCHANT_SECRET", { infer: true });
    this.domainName = configService.get("WAYFORPAY_MERCHANT_DOMAIN", { infer: true });
  }

  async createCheckout(order: PayableOrder): Promise<CheckoutInstructions> {
    const orderDate = Math.floor(Date.now() / 1000);
    const signature = this.sign([
      this.merchantAccount,
      this.domainName,
      order.id,
      String(orderDate),
      order.amount,
      order.currency,
      order.package.name,
      "1",
      order.amount,
    ]);

    const params = new URLSearchParams({
      merchantAccount: this.merchantAccount,
      merchantDomainName: this.domainName,
      merchantSignature: signature,
      orderReference: order.id,
      orderDate: String(orderDate),
      amount: order.amount,
      currency: order.currency,
      "productName[]": order.package.name,
      "productCount[]": "1",
      "productPrice[]": order.amount,
    });

    return { redirectUrl: `${PAY_URL}?${params.toString()}`, providerReference: order.id };
  }

  async verifyWebhook(rawBody: Buffer): Promise<boolean> {
    const payload = JSON.parse(rawBody.toString("utf-8")) as WayForPayCallback;
    const expected = this.sign([
      payload.merchantAccount,
      payload.orderReference,
      payload.amount != null ? String(payload.amount) : "",
      payload.currency ?? "",
      payload.authCode ?? "",
      payload.cardPan ?? "",
      payload.transactionStatus ?? "",
      payload.reasonCode != null ? String(payload.reasonCode) : "",
    ]);
    return expected === payload.merchantSignature;
  }

  parseWebhook(rawBody: Buffer): WebhookOutcome {
    const payload = JSON.parse(rawBody.toString("utf-8")) as WayForPayCallback;
    const status = payload.transactionStatus === "Approved" ? "PAID" : "FAILED";
    return { orderId: payload.orderReference, status, providerReference: payload.orderReference };
  }

  private sign(fields: string[]): string {
    return createHmac("md5", this.secretKey).update(fields.join(";")).digest("hex");
  }
}

interface WayForPayCallback {
  merchantAccount: string;
  orderReference: string;
  amount?: number;
  currency?: string;
  authCode?: string;
  cardPan?: string;
  transactionStatus?: string;
  reasonCode?: number;
  merchantSignature: string;
}
