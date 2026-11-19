import { INVITE_COOKIE, INVITE_MAX_AGE_SECONDS, deviceOf, inviteCookieDomain, isRobot, normalizeInviteCode } from "@/lib/invite-code";

/**
 * A personal invitation link: kiro.fineko.space/r/<code>.
 * It counts the click for the person who shared it, remembers the code in a cookie shared with the landing page
 * (*.fineko.space), and sends the visitor on to the landing page with the code in the address, so wherever the landing
 * sends them next (sign-up, the app) can carry it along. The code then travels with the sign-up, and the admin sees who
 * invited whom.
 */
export const dynamic = "force-dynamic";

const API_URL = process.env.API_URL ?? "http://localhost:3100";
const LANDING_URL = process.env.LANDING_URL ?? "https://kiro-lp.fineko.space/";

export async function GET(request: Request, { params }: { params: Promise<{ code: string }> }): Promise<Response> {
  const { code: raw } = await params;
  const code = normalizeInviteCode(raw);
  const landing = new URL(LANDING_URL);
  if (!code) return Response.redirect(landing.toString(), 302);

  const robot = isRobot(request.headers.get("user-agent"));
  // Best effort: a failed count must never stop the visitor reaching the landing page. Robots (link previews) are not counted.
  if (!robot) await fetch(`${API_URL}/api/v1/invites/click/${code}?device=${deviceOf(request.headers.get("user-agent"))}`, { method: "POST", signal: AbortSignal.timeout(3000) }).catch(() => undefined);

  landing.searchParams.set("ref", code);
  landing.searchParams.set("utm_source", "invite");
  landing.searchParams.set("utm_medium", "referral");
  // Behind the reverse proxy request.url is the internal address; the public host is in the forwarded headers.
  const publicHost = (request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "").split(":")[0]!;
  const domain = inviteCookieDomain(publicHost);
  const headers = new Headers({ Location: landing.toString() });
  if (!robot) headers.append("Set-Cookie", `${INVITE_COOKIE}=${code}; Max-Age=${INVITE_MAX_AGE_SECONDS}; Path=/; SameSite=Lax${domain ? `; Domain=${domain}; Secure` : ""}`);
  return new Response(null, { status: 302, headers });
}
