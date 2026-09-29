import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { google } from "googleapis";
import type { EnvConfig } from "../config/env.validation";
import { ApiException } from "../common/exceptions/api.exception";

export interface PlayPurchaseState {
  /** ISO timestamp the current billing period (or grace period) ends. */
  expiryTime: string;
  /** True once Google confirms the purchase (equivalent to the old v1 API's paymentState). */
  acknowledged: boolean;
  autoRenewing: boolean;
  /** "SUBSCRIPTION_STATE_ACTIVE" | "..._IN_GRACE_PERIOD" | "..._EXPIRED" | "..._CANCELED" | ... — see Android Publisher API v3. */
  state: string;
}

/**
 * Thin wrapper around the Android Publisher API's `purchases.subscriptionsv2.get` — the only call
 * PlatformSubscriptionsService needs, both right after a purchase and for the periodic recheck of
 * subscriptions nearing/at their recorded expiry (renewals happen on Google's side; this is how the
 * server finds out). A service account (Play Console → Setup → API access) is required; unset in
 * dev/tests, this throws a clear config error rather than attempting a call that can only fail —
 * same pattern as GoogleTokenVerifier/MonoAdapter.
 */
@Injectable()
export class GooglePlayVerifier {
  private readonly logger = new Logger(GooglePlayVerifier.name);
  private readonly packageName: string;
  private readonly credentialsJson?: string;

  constructor(configService: ConfigService<EnvConfig, true>) {
    this.packageName = configService.get("GOOGLE_PLAY_PACKAGE_NAME", { infer: true });
    this.credentialsJson = configService.get("GOOGLE_PLAY_SERVICE_ACCOUNT_JSON", { infer: true });
  }

  async getSubscription(purchaseToken: string): Promise<PlayPurchaseState> {
    if (!this.credentialsJson) {
      throw new ApiException("VALIDATION_ERROR", "Google Play subscriptions are not configured", 503);
    }

    let credentials: object;
    try {
      credentials = JSON.parse(this.credentialsJson);
    } catch {
      throw new ApiException("INTERNAL_ERROR", "GOOGLE_PLAY_SERVICE_ACCOUNT_JSON is not valid JSON", 500);
    }

    const auth = new google.auth.GoogleAuth({ credentials, scopes: ["https://www.googleapis.com/auth/androidpublisher"] });
    const androidpublisher = google.androidpublisher({ version: "v3", auth });

    try {
      const res = await androidpublisher.purchases.subscriptionsv2.get({ packageName: this.packageName, token: purchaseToken });
      const body = res.data;
      const lineItem = body.lineItems?.[0];
      if (!lineItem?.expiryTime || !body.subscriptionState) {
        throw new Error("unexpected response shape (missing expiryTime/subscriptionState)");
      }
      return {
        expiryTime: lineItem.expiryTime,
        acknowledged: body.acknowledgementState === "ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED",
        autoRenewing: !!lineItem.autoRenewingPlan?.autoRenewEnabled,
        state: body.subscriptionState,
      };
    } catch (err) {
      this.logger.warn(`Play purchase verification failed: ${err instanceof Error ? err.message : String(err)}`);
      throw new ApiException("VALIDATION_ERROR", "Could not verify this purchase with Google Play", 400);
    }
  }
}
