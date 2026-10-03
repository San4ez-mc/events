import type { Request } from "express";

/** Header the current mobile build sends; builds without it predate external-registration events. */
export const APP_FEATURES_HEADER = "x-app-features";

/**
 * Old native app builds don't know about `registrationMode: "EXTERNAL"` events — their register button would hit an
 * error. They're recognised by the native HTTP stack's User-Agent (okhttp / CFNetwork / Expo) plus the missing
 * features header; browsers (the website) and the current app are never treated as old.
 */
export function isLegacyNativeClient(req: Request): boolean {
  const ua = String(req.headers["user-agent"] ?? "");
  if (!/okhttp|cfnetwork|expo/i.test(ua)) return false;
  return !String(req.headers[APP_FEATURES_HEADER] ?? "").includes("external-reg");
}
