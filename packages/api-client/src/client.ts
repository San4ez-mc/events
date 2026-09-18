import createClient, { type Middleware } from "openapi-fetch";
import type { ApiErrorBody } from "@kiro/types";
import type { paths } from "./schema";

export type { paths } from "./schema";

export interface KiroApiClientOptions {
  baseUrl: string;
  /** "web" sets cookies for refresh; "mobile" carries the refresh token in JSON bodies (§9). */
  clientPlatform: "web" | "mobile";
  getAccessToken: () => string | null | undefined;
  /**
   * Called when a request comes back 401 with AUTH_REQUIRED — implement
   * refresh-and-retry here. Returning the new access token retries the
   * original request once; returning null/undefined surfaces the 401.
   */
  onUnauthorized?: () => Promise<string | null | undefined>;
}

/**
 * Thin typed wrapper around the generated OpenAPI client. This is the ONLY
 * place web/mobile should import `fetch`-level API logic from — never
 * hand-roll a parallel set of interfaces per §8.
 */
export function createKiroApiClient(options: KiroApiClientOptions) {
  const client = createClient<paths>({ baseUrl: options.baseUrl, credentials: "include" });

  const authMiddleware: Middleware = {
    async onRequest({ request }) {
      const token = options.getAccessToken();
      if (token) {
        request.headers.set("Authorization", `Bearer ${token}`);
      }
      request.headers.set("X-Client-Platform", options.clientPlatform);
      return request;
    },
    async onResponse({ response, request }) {
      if (response.status === 401 && options.onUnauthorized) {
        const body = (await response.clone().json().catch(() => null)) as ApiErrorBody | null;
        if (body?.error?.code === "AUTH_REQUIRED") {
          const newToken = await options.onUnauthorized();
          if (newToken) {
            request.headers.set("Authorization", `Bearer ${newToken}`);
            return fetch(request);
          }
        }
      }
      return response;
    },
  };

  client.use(authMiddleware);
  return client;
}

export type KiroApiClient = ReturnType<typeof createKiroApiClient>;
