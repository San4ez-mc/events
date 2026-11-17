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

/**
 * Many screens call `fetch("/api/v1/...", { headers: { Authorization: Bearer <token> } })` directly. The access token lives
 * only a short while, so a tab left open for a few minutes then got a 401 and the screen showed "Щось пішло не так" (or
 * stayed on "Завантаження…"). This wraps the browser's fetch once: a 401 on an authenticated /api/v1 call refreshes the
 * token (single-flighted, see refreshAccessToken) and repeats the request with the new one. Calls through the typed client
 * (they pass a Request) already have their own refresh and are left alone.
 */
function installAuthRetry(): void {
  if (typeof window === "undefined" || (window as { __kiroAuthRetry?: boolean }).__kiroAuthRetry) return;
  (window as { __kiroAuthRetry?: boolean }).__kiroAuthRetry = true;
  const original = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const res = await original(input, init);
    if (res.status !== 401 || input instanceof Request) return res;
    const path = new URL(typeof input === "string" ? input : input.href, window.location.origin).pathname;
    if (!path.startsWith("/api/v1/") || path.startsWith("/api/v1/auth/")) return res;
    const headers = new Headers(init?.headers);
    const sent = headers.get("Authorization");
    if (!sent) return res;
    // Someone else may have refreshed already: then just repeat with the current token.
    const current = getAccessToken();
    const token = current && `Bearer ${current}` !== sent ? current : await refreshAccessToken();
    if (!token) return res;
    headers.set("Authorization", `Bearer ${token}`);
    return original(input, { ...init, headers });
  };
}

installAuthRetry();
