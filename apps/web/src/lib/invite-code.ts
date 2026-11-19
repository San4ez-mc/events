/**
 * The personal invitation code of whoever brought this visitor (the "/r/<code>" link, or "?ref=<code>" on any page).
 * It is kept for 30 days in a cookie shared by the whole *.fineko.space (so the landing page and the app's website both see
 * it) and mirrored in localStorage, then sent with the sign-up so the admin can see who invited whom.
 */
export const INVITE_COOKIE = "kiro_ref";
export const INVITE_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;
const CODE_LENGTH = 8;

/** "ab3d-ef4g" -> "AB3DEF4G"; anything that is not an 8-character code gives null. */
export function normalizeInviteCode(raw: string | null | undefined): string | null {
  const code = (raw ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  return code.length === CODE_LENGTH ? code : null;
}

/**
 * Link-preview and search robots (Facebook/Instagram, Telegram, WhatsApp, Slack, Google...) open a shared link to build the
 * preview, sometimes dozens of times. They must still reach the landing page, but they are not people: not counted, no cookie.
 */
export function isRobot(userAgent: string | null | undefined): boolean {
  return !userAgent || /bot|crawl|spider|slurp|preview|facebookexternalhit|facebot|whatsapp|telegram|skype|discord|slack|linkedin|pinterest|embedly|curl|wget|python-requests|node-fetch|headless|lighthouse/i.test(userAgent);
}

/** What the person opened the link on, for the admin's lists. */
export function deviceOf(userAgent: string | null | undefined): "ANDROID" | "IPHONE" | "DESKTOP" | "OTHER" {
  const ua = userAgent ?? "";
  if (/android/i.test(ua)) return "ANDROID";
  if (/iphone|ipad|ipod/i.test(ua)) return "IPHONE";
  if (/windows|macintosh|linux|x11|cros/i.test(ua)) return "DESKTOP";
  return "OTHER";
}

/** The Domain attribute shared with the landing page; none on localhost / other hosts. */
export function inviteCookieDomain(host: string): string | null {
  return /(^|\.)fineko\.space$/.test(host) ? ".fineko.space" : null;
}

function store(code: string): void {
  try {
    window.localStorage.setItem(INVITE_COOKIE, code);
  } catch {
    // Storage blocked: the cookie below still carries it.
  }
  const domain = inviteCookieDomain(window.location.hostname);
  document.cookie = `${INVITE_COOKIE}=${code}; Max-Age=${INVITE_MAX_AGE_SECONDS}; Path=/; SameSite=Lax${domain ? `; Domain=${domain}` : ""}${window.location.protocol === "https:" ? "; Secure" : ""}`;
}

/** Called once when the app opens: remembers a "?ref=<code>" from the address, if there is one. */
export function captureInviteCode(): void {
  if (typeof window === "undefined") return;
  const code = normalizeInviteCode(new URLSearchParams(window.location.search).get("ref"));
  if (code) store(code);
}

export function readInviteCode(): string | undefined {
  if (typeof window === "undefined") return undefined;
  const fromCookie = document.cookie.split("; ").find((c) => c.startsWith(`${INVITE_COOKIE}=`))?.split("=")[1];
  let fromStorage: string | null = null;
  try {
    fromStorage = window.localStorage.getItem(INVITE_COOKIE);
  } catch {
    // ignore
  }
  return normalizeInviteCode(fromCookie) ?? normalizeInviteCode(fromStorage) ?? undefined;
}

/** After a successful sign-up the code has done its job: the next person on this device must not inherit it. */
export function clearInviteCode(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(INVITE_COOKIE);
  } catch {
    // ignore
  }
  const domain = inviteCookieDomain(window.location.hostname);
  document.cookie = `${INVITE_COOKIE}=; Max-Age=0; Path=/${domain ? `; Domain=${domain}` : ""}`;
}
