import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import webpush from "web-push";
import type { EnvConfig } from "../config/env.validation";

export interface WebPushResult {
  ok: boolean;
  /** The browser says this subscription is gone (404/410): deactivate it. */
  gone: boolean;
  error?: string;
}

/**
 * Browser (Web Push / VAPID) delivery for people who installed the site as an app — the only way to reach iPhone users,
 * who have no native app. A web device's `pushToken` is the browser's PushSubscription serialised as JSON. Without the
 * VAPID keys in the environment this is a no-op (`publicKey` is null and nothing is sent).
 */
@Injectable()
export class WebPushService {
  private readonly logger = new Logger(WebPushService.name);
  readonly publicKey: string | null;
  private readonly enabled: boolean;

  constructor(config: ConfigService<EnvConfig, true>) {
    const publicKey = config.get("WEB_PUSH_PUBLIC_KEY", { infer: true });
    const privateKey = config.get("WEB_PUSH_PRIVATE_KEY", { infer: true });
    this.enabled = Boolean(publicKey && privateKey);
    this.publicKey = this.enabled ? (publicKey ?? null) : null;
    if (this.enabled) {
      webpush.setVapidDetails(config.get("WEB_PUSH_SUBJECT", { infer: true }) ?? "mailto:support@kiro.fineko.space", publicKey!, privateKey!);
    }
  }

  async send(subscriptionJson: string, payload: { title: string; body: string; url: string }): Promise<WebPushResult> {
    if (!this.enabled) return { ok: false, gone: false, error: "Web push is not configured" };
    let subscription: webpush.PushSubscription;
    try {
      subscription = JSON.parse(subscriptionJson) as webpush.PushSubscription;
    } catch {
      return { ok: false, gone: true, error: "Malformed subscription" };
    }
    try {
      await webpush.sendNotification(subscription, JSON.stringify(payload), { TTL: 60 * 60 * 24 });
      return { ok: true, gone: false };
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode;
      if (status !== 404 && status !== 410) this.logger.warn(`Web push failed (${status ?? "no status"}): ${(err as Error).message}`);
      return { ok: false, gone: status === 404 || status === 410, error: (err as Error).message };
    }
  }
}
