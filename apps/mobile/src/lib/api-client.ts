import { createKiroApiClient } from "@kiro/api-client";
import { getStoredRefreshToken, setStoredRefreshToken } from "./token-storage";

/**
 * No same-origin proxy on mobile (unlike web's Next.js rewrite) — talks
 * directly to the API. Set via `EXPO_PUBLIC_API_URL` in `.env` (Expo inlines
 * `EXPO_PUBLIC_*` vars at build time); falls back to the dev tunnel's local
 * port for `expo start`.
 */
const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3100";

/**
 * The Next.js web app's own origin — legal pages (terms/offer/refund/privacy/contacts) live there,
 * not on the API. In production both are the same domain (Next.js proxies /api/* to the backend),
 * so this falls back to API_URL rather than a dev-only default that would break in a real build.
 */
export const WEB_URL = process.env.EXPO_PUBLIC_WEB_URL ?? API_URL;

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

        let res: Response;
        try {
          res = await fetch(`${API_URL}/api/v1/auth/refresh`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ refreshToken }),
          });
        } catch {
          return null; // offline: keep the stored token, try again later
        }
        if (!res.ok) {
          // Only a definitive rejection ends the session. A 5xx/429 used to wipe the stored refresh
          // token too, turning one transient server hiccup into a permanent logout.
          if (res.status === 400 || res.status === 401 || res.status === 403) {
            setAccessToken(null);
            await setStoredRefreshToken(null);
          }
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

/**
 * Most screens call `fetch` directly with the in-memory access token and never handled a 401, so once
 * the short-lived token expired they just rendered blank/empty (Saved, Notifications, Friends, Credits...).
 * Rather than patch every call site, any authenticated request to our own API that comes back 401 is
 * transparently retried once with a refreshed token. Requests without an Authorization header (login,
 * refresh itself) are left alone, so this can't loop.
 */
const originalFetch: typeof fetch = globalThis.fetch.bind(globalThis);
globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : null;
  const isApi = !!url && url.startsWith(`${API_URL}/api/`);
  // Tells the API this build understands externally-registered events (older builds don't get them in the feed).
  if (isApi) {
    const withFeatures = new Headers(init?.headers);
    withFeatures.set("X-App-Features", "external-reg");
    init = { ...init, headers: withFeatures };
  }
  const res = await originalFetch(input, init);
  if (res.status !== 401) return res;
  if (!isApi) return res;
  const headers = new Headers(init?.headers);
  const auth = headers.get("Authorization");
  if (!auth) return res;
  const used = auth.replace(/^Bearer /, "");
  const current = getAccessToken();
  const fresh = current && current !== used ? current : await refreshAccessToken();
  if (!fresh) return res;
  headers.set("Authorization", `Bearer ${fresh}`);
  return originalFetch(input, { ...init, headers });
}) as typeof fetch;

export const api = createKiroApiClient({
  baseUrl: API_URL,
  clientPlatform: "mobile",
  getAccessToken,
  onUnauthorized: refreshAccessToken,
});

export { API_URL };
