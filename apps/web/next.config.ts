import type { NextConfig } from "next";

/**
 * Web and API are kept same-origin from the browser's point of view, via a
 * transparent rewrite rather than a cross-origin fetch. This matters
 * specifically for the auth refresh cookie: httpOnly + SameSite=Lax cookies
 * are unreliable across a cross-origin fetch/XHR (even same-site, e.g.
 * localhost:3000 -> localhost:3100 is already cross-origin), so rather than
 * relax the cookie's SameSite policy, the browser only ever talks to this
 * app's own origin — Next.js forwards server-to-server, where cookies don't
 * apply. This also matches the planned production layout
 * (kiro.fineko.space/api/* -> the API process, docs/VPS_ACCESS.md), so dev
 * and prod share the same origin model instead of diverging.
 */
const API_URL = process.env.API_URL ?? "http://localhost:3100";

const nextConfig: NextConfig = {
  // Public OAuth client ID (not a secret) — baked into the client bundle for Google sign-in (§9).
  env: { NEXT_PUBLIC_GOOGLE_CLIENT_ID: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "257175906055-2o5q0jlm3cavm1tihvscjs8tpg67ec6l.apps.googleusercontent.com" },
  async rewrites() {
    return [
      {
        source: "/api/v1/:path*",
        destination: `${API_URL}/api/v1/:path*`,
      },
    ];
  },
};

export default nextConfig;
