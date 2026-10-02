import type { MetadataRoute } from "next";

/** Makes the site installable ("Add to Home Screen") on iPhone and Android — it then opens full-screen like an app. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Кіро — події поруч",
    short_name: "Кіро",
    description: "Платформа пошуку подій та розваг — гортай, обирай, записуйся.",
    lang: "uk",
    start_url: "/?source=pwa",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0b0b12",
    theme_color: "#8b5cf6",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
