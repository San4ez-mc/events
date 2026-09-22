import { Injectable, Logger } from "@nestjs/common";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

export interface ExpoPushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

export interface ExpoPushResult {
  to: string;
  ok: boolean;
  /** Set when Expo reports the token itself is dead (§41 — "deactivate invalid tokens"). */
  deviceNotRegistered: boolean;
  error?: string;
}

/**
 * §41 — thin wrapper around Expo's push HTTP API, isolated in its own
 * injectable service so NotificationsService doesn't need network mocking to
 * be unit-tested and so this is the one place that knows Expo's wire format.
 */
@Injectable()
export class ExpoPushService {
  private readonly logger = new Logger(ExpoPushService.name);

  async send(messages: ExpoPushMessage[]): Promise<ExpoPushResult[]> {
    if (messages.length === 0) return [];

    try {
      const res = await fetch(EXPO_PUSH_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(
          messages.map((m) => ({ to: m.to, title: m.title, body: m.body, data: m.data })),
        ),
      });
      const body = (await res.json()) as {
        data?: Array<{ status: "ok" | "error"; message?: string; details?: { error?: string } }>;
      };

      return messages.map((m, i) => {
        const result = body.data?.[i];
        if (!result || result.status !== "ok") {
          return {
            to: m.to,
            ok: false,
            deviceNotRegistered: result?.details?.error === "DeviceNotRegistered",
            error: result?.message ?? "Unknown Expo push error",
          };
        }
        return { to: m.to, ok: true, deviceNotRegistered: false };
      });
    } catch (err) {
      this.logger.warn(`Expo push request failed: ${err instanceof Error ? err.message : String(err)}`);
      return messages.map((m) => ({ to: m.to, ok: false, deviceNotRegistered: false, error: "Request failed" }));
    }
  }
}
