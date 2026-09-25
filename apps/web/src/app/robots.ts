import type { MetadataRoute } from "next";

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://kiro.fineko.space";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/admin",
          "/organizer",
          "/profile",
          "/credits",
          "/my-registrations",
          "/saved",
          "/friends",
          "/invitations",
          "/auth",
          "/api",
        ],
      },
    ],
    sitemap: `${SITE}/sitemap.xml`,
  };
}
