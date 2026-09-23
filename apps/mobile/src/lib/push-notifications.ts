import { useEffect } from "react";
import { Platform } from "react-native";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
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
export function usePushNotificationRegistration(userId: string | undefined): void {
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
