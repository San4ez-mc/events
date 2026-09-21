import { createKiroApiClient } from "@kiro/api-client";

/**
 * Module-level mutable holder for the current access token. The generic
 * openapi-fetch client's auth middleware needs synchronous, non-React access
 * to "whatever the token is right now" — React state alone can't satisfy
 * that (a stale closure would keep using the token from whenever the client
 * was created). AuthProvider is the only thing that calls setAccessToken();
 * everything else only ever reads through getAccessToken().
 */
let currentAccessToken: string | null = null;

export function getAccessToken(): string | null {
  return currentAccessToken;
}

export function setAccessToken(token: string | null): void {
  currentAccessToken = token;
}

/**
 * The refresh endpoint issues a single-use rotating token (§9) — presenting
 * an already-rotated-out token is treated as theft and revokes the whole
 * session. Two callers refreshing at once (React StrictMode's dev-only
 * double-effect-invocation, two tabs racing, a retry racing the original
 * request) would otherwise each fire their own request against the same
 * starting cookie, and the loser gets flagged as a thief. Single-flighting
 * the request — every concurrent caller awaits the one in-progress
 * promise instead of starting their own — makes concurrent refreshes safe.
 */
let inFlightRefresh: Promise<string | null> | null = null;

export function refreshAccessToken(): Promise<string | null> {
  if (!inFlightRefresh) {
    inFlightRefresh = (async () => {
      try {
        const res = await fetch("/api/v1/auth/refresh", {
          method: "POST",
          headers: { "X-Client-Platform": "web" },
          credentials: "include",
        });
        if (!res.ok) {
          setAccessToken(null);
          return null;
        }
        const body = (await res.json()) as { accessToken: string };
        setAccessToken(body.accessToken);
        return body.accessToken;
      } finally {
        inFlightRefresh = null;
      }
    })();
  }
  return inFlightRefresh;
}

/**
 * Relative baseUrl — the browser only ever talks to this app's own origin;
 * Next.js rewrites (next.config.ts) forward /api/v1/* to the real API
 * server-to-server. See that file for why (refresh-cookie same-origin
 * requirement).
 */
export const api = createKiroApiClient({
  baseUrl: "",
  clientPlatform: "web",
  getAccessToken,
  onUnauthorized: refreshAccessToken,
});
