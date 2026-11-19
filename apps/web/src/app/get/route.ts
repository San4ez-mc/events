import { INVITE_COOKIE, INVITE_MAX_AGE_SECONDS, inviteCookieDomain, isRobot, normalizeInviteCode } from "@/lib/invite-code";

/**
 * The landing page's "download" button points here: kiro.fineko.space/get?ref=<code>.
 * It counts the press for the person who invited this visitor, keeps the code in the cookie shared with the landing page
 * and sends the visitor to Google Play with the code inside the link (Play's "referrer" parameter), which the Android app can
 * read after installing. Without a code it simply goes to Google Play.
 *   ?to=web  -> opens the website instead (iPhone and desktop: there is no iOS app yet), the code travels as ?ref=.
 */
export const dynamic = "force-dynamic";

const API_URL = process.env.API_URL ?? "http://localhost:3100";
const PLAY_URL = process.env.PLAY_STORE_URL ?? "https://play.google.com/store/apps/details?id=space.fineko.kiro";
const SITE_URL = process.env.SITE_URL ?? "https://kiro.fineko.space";

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const cookieCode = (request.headers.get("cookie") ?? "").split("; ").find((c) => c.startsWith(`${INVITE_COOKIE}=`))?.split("=")[1];
  const code = normalizeInviteCode(url.searchParams.get("ref")) ?? normalizeInviteCode(cookieCode);
  const toWeb = url.searchParams.get("to") === "web";

  const robot = isRobot(request.headers.get("user-agent"));
  const target = new URL(toWeb ? SITE_URL : PLAY_URL);
  if (code) {
    // Best effort: a failed count must never stop the visitor reaching the store. Robots (link previews) are not counted.
    if (!robot) await fetch(`${API_URL}/api/v1/invites/click/${code}?kind=download`, { method: "POST", signal: AbortSignal.timeout(3000) }).catch(() => undefined);
    if (toWeb) target.searchParams.set("ref", code);
    else target.searchParams.set("referrer", `kiro_ref=${code}&utm_source=invite&utm_medium=referral`);
  }

  const headers = new Headers({ Location: target.toString() });
  if (code && !robot) {
    // Behind the reverse proxy request.url is the internal address; the public host is in the forwarded headers.
    const publicHost = (request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "").split(":")[0]!;
    const domain = inviteCookieDomain(publicHost);
    headers.append("Set-Cookie", `${INVITE_COOKIE}=${code}; Max-Age=${INVITE_MAX_AGE_SECONDS}; Path=/; SameSite=Lax${domain ? `; Domain=${domain}; Secure` : ""}`);
  }
  return new Response(null, { status: 302, headers });
}
