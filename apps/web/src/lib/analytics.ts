/** §45 — fire-and-forget event analytics. Never throws and never blocks the UI. */

export type TrackedAction =
  "IMPRESSION" | "VIEW" | "SHARE" | "REGISTRATION_STARTED";
export type TrafficSource =
  "SWIPE" | "SEARCH" | "DIRECT" | "PROFILE" | "THREADS" | "OTHER";

const SESSION_KEY = "kiro_session";

function sessionId(): string | undefined {
  try {
    let id = window.sessionStorage.getItem(SESSION_KEY);
    if (!id) {
      id =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : String(Date.now());
      window.sessionStorage.setItem(SESSION_KEY, id);
    }
    return id;
  } catch {
    return undefined;
  }
}

export function track(
  eventId: string,
  action: TrackedAction,
  source?: TrafficSource,
): void {
  try {
    void fetch("/api/v1/analytics/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      keepalive: true,
      body: JSON.stringify({
        events: [{ eventId, action, source }],
        sessionId: sessionId(),
      }),
    }).catch(() => {});
  } catch {
    // Analytics must never affect the page.
  }
}

/** UX §35 source detection: explicit ?src= from our own links, utm_source=threads, otherwise direct/other by referrer. */
export function detectSource(): TrafficSource {
  const params = new URLSearchParams(window.location.search);
  const src = params.get("src")?.toUpperCase();
  if (src === "SWIPE" || src === "SEARCH" || src === "PROFILE") return src;
  if ((params.get("utm_source") ?? "").toLowerCase().includes("thread"))
    return "THREADS";
  if (!document.referrer) return "DIRECT";
  try {
    return new URL(document.referrer).host === window.location.host
      ? "OTHER"
      : "DIRECT";
  } catch {
    return "OTHER";
  }
}
