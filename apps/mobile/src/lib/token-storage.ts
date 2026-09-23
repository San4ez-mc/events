import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

const REFRESH_TOKEN_KEY = "kiro_refresh_token";

/**
 * §9 — mobile has no httpOnly cookie, so the refresh token is persisted
 * ourselves. expo-secure-store isn't available on the web target (used only
 * for local `expo start --web` development/preview) — falls back to
 * localStorage there, which is fine since web builds aren't shipped.
 */
export async function getStoredRefreshToken(): Promise<string | null> {
  if (Platform.OS === "web") {
    return typeof localStorage !== "undefined" ? localStorage.getItem(REFRESH_TOKEN_KEY) : null;
  }
  return SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
}

export async function setStoredRefreshToken(token: string | null): Promise<void> {
  if (Platform.OS === "web") {
    if (typeof localStorage === "undefined") return;
    if (token) localStorage.setItem(REFRESH_TOKEN_KEY, token);
    else localStorage.removeItem(REFRESH_TOKEN_KEY);
    return;
  }
  if (token) await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, token);
  else await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
}
