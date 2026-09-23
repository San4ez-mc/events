import { createKiroApiClient } from "@kiro/api-client";
import { getStoredRefreshToken, setStoredRefreshToken } from "./token-storage";

/**
 * No same-origin proxy on mobile (unlike web's Next.js rewrite) — talks
 * directly to the API. Set via `EXPO_PUBLIC_API_URL` in `.env` (Expo inlines
 * `EXPO_PUBLIC_*` vars at build time); falls back to the dev tunnel's local
 * port for `expo start`.
 */
const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3100";

let currentAccessToken: string | null = null;

export function getAccessToken(): string | null {
  return currentAccessToken;
}

export function setAccessToken(token: string | null): void {
  currentAccessToken = token;
}

/** Same single-flight reasoning as web's api-client.ts — concurrent refreshes must never race the one-time-use rotating token. */
let inFlightRefresh: Promise<string | null> | null = null;

export function refreshAccessToken(): Promise<string | null> {
  if (!inFlightRefresh) {
    inFlightRefresh = (async () => {
      try {
        const refreshToken = await getStoredRefreshToken();
        if (!refreshToken) return null;

        const res = await fetch(`${API_URL}/api/v1/auth/refresh`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refreshToken }),
        });
        if (!res.ok) {
          setAccessToken(null);
          await setStoredRefreshToken(null);
          return null;
        }
        const body = (await res.json()) as { accessToken: string; refreshToken: string };
        setAccessToken(body.accessToken);
        await setStoredRefreshToken(body.refreshToken);
        return body.accessToken;
      } finally {
        inFlightRefresh = null;
      }
    })();
  }
  return inFlightRefresh;
}

export const api = createKiroApiClient({
  baseUrl: API_URL,
  clientPlatform: "mobile",
  getAccessToken,
  onUnauthorized: refreshAccessToken,
});

export { API_URL };
