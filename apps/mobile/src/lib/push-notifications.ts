import { useEffect } from "react";
import { Platform } from "react-native";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import { router } from "expo-router";
import { captureEvent } from "./product-analytics";
import { API_URL, getAccessToken } from "./api-client";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

/**
 * §41 — registers this device's Expo push token with the backend
 * (`POST /notifications/devices`) whenever the user is signed in. Needs a
 * real EAS `projectId` (via `eas init`, then set in app.json's
 * `extra.eas.projectId`) to mint a token — without one this silently no-ops,
 * same "works for real once configured" posture as the payment adapters.
 */
function handlePushTap(response: Notifications.NotificationResponse): void {
  const data = (response.notification.request.content.data ?? {}) as { notificationId?: string; slug?: string };
  const token = getAccessToken();
  if (data.notificationId && token) {
    // Opening the notification counts as reading it - this is also how we measure whether pushes get opened.
    void fetch(`${API_URL}/api/v1/notifications/${data.notificationId}/read`, { method: "PATCH", headers: { Authorization: `Bearer ${token}` } }).catch(() => {});
  }
  captureEvent("push_open", { has_event: Boolean(data.slug) });
  if (data.slug) router.push(`/event/${data.slug}`);
}

/** Taps on a push (while running, or the one that launched the app) open the event and are recorded. */
function usePushTaps(userId: string | undefined): void {
  useEffect(() => {
    if (!userId || Platform.OS === "web") return;
    const sub = Notifications.addNotificationResponseReceivedListener(handlePushTap);
    void Notifications.getLastNotificationResponseAsync().then((last) => {
      if (last) handlePushTap(last);
    });
    return () => sub.remove();
  }, [userId]);
}

export function usePushNotificationRegistration(userId: string | undefined): void {
  usePushTaps(userId);
  useEffect(() => {
    if (!userId || Platform.OS === "web" || !Device.isDevice) return;

    let cancelled = false;
    (async () => {
      const { status: existing } = await Notifications.getPermissionsAsync();
      let status = existing;
      if (status !== "granted") {
        ({ status } = await Notifications.requestPermissionsAsync());
      }
      if (status !== "granted" || cancelled) return;

      const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
      if (!projectId) return;

      try {
        const { data: pushToken } = await Notifications.getExpoPushTokenAsync({ projectId });
        if (cancelled) return;

        const token = getAccessToken();
        if (!token) return;
        await fetch(`${API_URL}/api/v1/notifications/devices`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ pushToken, platform: Platform.OS === "ios" ? "IOS" : "ANDROID" }),
        });
      } catch {
        // No EAS project configured yet, or the push service is unreachable — best-effort.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [userId]);
}
