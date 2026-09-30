import { API_URL, getAccessToken } from "./api-client";

let installed = false;

async function send(message: string, stack?: string, context?: string) {
  const token = getAccessToken();
  try {
    await fetch(`${API_URL}/api/v1/client-errors`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        source: "mobile",
        message: message.slice(0, 2000),
        stack: stack?.slice(0, 8000),
        context,
      }),
    });
  } catch {
    // Best-effort — if this fails too, there's nothing left to do.
  }
}

type ErrorHandler = (error: unknown, isFatal?: boolean) => void;

/**
 * No crash-reporting SDK (Sentry/Crashlytics) in this app — uncaught JS exceptions and
 * unhandled promise rejections are reported to our own backend instead, which forwards
 * them to the FINEKO "Правки" platform (same destination as in-app feedback). Call once,
 * as early as possible (root _layout).
 */
export function installCrashReporter() {
  if (installed) return;
  installed = true;

  const g = globalThis as typeof globalThis & {
    ErrorUtils?: { setGlobalHandler: (fn: ErrorHandler) => void; getGlobalHandler?: () => ErrorHandler };
    addEventListener?: (type: string, listener: (event: { reason?: unknown }) => void) => void;
  };

  const previousHandler = g.ErrorUtils?.getGlobalHandler?.();
  g.ErrorUtils?.setGlobalHandler((error, isFatal) => {
    const err = error instanceof Error ? error : new Error(String(error));
    void send(`${isFatal ? "[FATAL] " : ""}${err.message}`, err.stack, "Global JS exception");
    previousHandler?.(error, isFatal);
  });

  g.addEventListener?.("unhandledrejection", (event) => {
    const reason = event?.reason;
    const err = reason instanceof Error ? reason : new Error(String(reason));
    void send(err.message, err.stack, "Unhandled promise rejection");
  });
}

export { send as reportClientError };
