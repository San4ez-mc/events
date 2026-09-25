/** iOS Universal Links. Needs the Apple Developer Team ID in APPLE_TEAM_ID; empty until set. */
export const dynamic = "force-dynamic";

export function GET() {
  const teamId = process.env.APPLE_TEAM_ID;
  const body = teamId
    ? { applinks: { details: [{ appIDs: [`${teamId}.space.fineko.kiro`], components: [{ "/": "/events/*" }, { "/": "/users/*" }] }] } }
    : { applinks: { details: [] } };
  return new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" } });
}
