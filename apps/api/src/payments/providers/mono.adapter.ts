import { Injectable, Logger } from "@nestjs/common";
import { createPublicKey, verify as verifySignature, type KeyObject } from "node:crypto";
import { ConfigService } from "@nestjs/config";
import { ApiException } from "../../common/exceptions/api.exception";
import type { EnvConfig } from "../../config/env.validation";
import type { CheckoutInstructions, PayableOrder, PaymentProviderAdapter, WebhookOutcome } from "./payment-provider.interface";

const API_BASE = "https://api.monobank.ua";

/** The fixed 26-byte DER SubjectPublicKeyInfo prefix for a P-256 (prime256v1) EC key — Mono's pubkey endpoint returns only the raw 65-byte point, not a full DER key. */
const P256_SPKI_PREFIX = Buffer.from("3059301306072a8648ce3d020106082a8648ce3d030107034200", "hex");

/**
 * §51 — Monobank Merchant Acquiring. Unlike WayForPay, Mono has no
 * "sign locally and redirect" mode: creating a checkout genuinely requires a
 * server-to-server call to mint an invoice, so `createCheckout` needs
 * `MONO_TOKEN` configured (it throws a clear config error otherwise rather
 * than attempting a call that can only fail). Webhook verification is pure
 * local ECDSA-SHA256 over the raw body against Mono's public key — no
 * network needed once that key is known, so it stays fully testable via
 * `MONO_PUBLIC_KEY_BASE64` (skips the live fetch entirely).
 */
@Injectable()
export class MonoAdapter implements PaymentProviderAdapter {
  private readonly logger = new Logger(MonoAdapter.name);
  private readonly token?: string;
  private readonly pubKeyOverride?: string;
  private readonly webhookUrl: string;
  private cachedPublicKey: KeyObject | null = null;

  constructor(configService: ConfigService<EnvConfig, true>) {
    this.token = configService.get("MONO_TOKEN", { infer: true });
    this.pubKeyOverride = configService.get("MONO_PUBLIC_KEY_BASE64", { infer: true });
    this.webhookUrl = `${configService.get("API_URL", { infer: true })}/api/v1/payments/webhooks/mono`;
  }

  async createCheckout(order: PayableOrder): Promise<CheckoutInstructions> {
    if (!this.token) {
      throw new ApiException("VALIDATION_ERROR", "Mono payments are not configured", 503);
    }

    const amountKopecks = Math.round(Number(order.amount) * 100);
    const res = await fetch(`${API_BASE}/api/merchant/invoice/create`, {
      method: "POST",
      headers: { "X-Token": this.token, "Content-Type": "application/json" },
      body: JSON.stringify({
        amount: amountKopecks,
        ccy: 980, // ISO 4217 numeric code for UAH
        merchantPaymInfo: { reference: order.id, destination: order.package.name },
        webHookUrl: this.webhookUrl,
      }),
    });
    if (!res.ok) {
      this.logger.warn(`Mono invoice creation failed: ${res.status} ${await res.text()}`);
      throw new ApiException("VALIDATION_ERROR", "Could not start a Mono payment", 502);
    }

    const body = (await res.json()) as { invoiceId: string; pageUrl: string };
    return { redirectUrl: body.pageUrl, providerReference: body.invoiceId };
  }

  async verifyWebhook(rawBody: Buffer, headers: Record<string, string | string[] | undefined>): Promise<boolean> {
    const signatureHeader = headers["x-sign"];
    const signatureBase64 = Array.isArray(signatureHeader) ? signatureHeader[0] : signatureHeader;
    if (!signatureBase64) return false;

    const publicKey = await this.getPublicKey();
    if (!publicKey) return false;

    return verifySignature("sha256", rawBody, { key: publicKey, dsaEncoding: "der" }, Buffer.from(signatureBase64, "base64"));
  }

  parseWebhook(rawBody: Buffer): WebhookOutcome {
    const payload = JSON.parse(rawBody.toString("utf-8")) as MonoWebhookPayload;
    const status = payload.status === "success" ? "PAID" : "FAILED";
    return { orderId: payload.reference, status, providerReference: payload.invoiceId };
  }

  private async getPublicKey(): Promise<KeyObject | null> {
    if (this.cachedPublicKey) return this.cachedPublicKey;

    const rawBase64 = this.pubKeyOverride ?? (await this.fetchLivePublicKey());
    if (!rawBase64) return null;

    const der = Buffer.concat([P256_SPKI_PREFIX, Buffer.from(rawBase64, "base64")]);
    this.cachedPublicKey = createPublicKey({ key: der, format: "der", type: "spki" });
    return this.cachedPublicKey;
  }

  private async fetchLivePublicKey(): Promise<string | null> {
    if (!this.token) return null;
    try {
      const res = await fetch(`${API_BASE}/api/merchant/pubkey`, { headers: { "X-Token": this.token } });
      if (!res.ok) return null;
      const body = (await res.json()) as { key: string };
      return body.key;
    } catch (err) {
      this.logger.warn(`Could not fetch Mono's public key: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    }
  }
}

interface MonoWebhookPayload {
  invoiceId: string;
  status: "created" | "processing" | "hold" | "success" | "failure" | "reversed" | "expired";
  reference: string;
}
