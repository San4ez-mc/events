import { Suspense } from "react";
import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { cookies } from "next/headers";
import "./globals.css";
import { themeInitScript } from "@/lib/theme-script";
import { ThemeProvider } from "@/lib/theme-context";
import { LocaleProvider } from "@/lib/locale-context";
import { LOCALE_COOKIE, resolveLocale } from "@/lib/locale";
import { AuthProvider } from "@/lib/auth-context";
import { SiteHeader } from "@/components/site-header";
import { BottomNav } from "@/components/bottom-nav";
import { SiteFooter } from "@/components/site-footer";
import { AnalyticsProvider } from "@/components/analytics-provider";
import { PwaInstallHint } from "@/components/pwa-install-hint";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin", "cyrillic"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const viewport: Viewport = {
  themeColor: "#8b5cf6",
};

export const metadata: Metadata = {
  applicationName: "Кіро",
  appleWebApp: { capable: true, title: "Кіро", statusBarStyle: "default" },
  title: "Кіро",
  description: "Платформа пошуку подій та розваг — гортай, обирай, записуйся.",
  openGraph: {
    title: "Кіро",
    description: "Гортай, обирай, записуйся.",
    images: ["/logo.jpg"],
  },
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const cookieStore = await cookies();
  const locale = resolveLocale(cookieStore.get(LOCALE_COOKIE)?.value);

  return (
    <html
      lang={locale}
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        {/* Must run synchronously before paint to avoid a theme flash (see lib/theme-script.ts). */}
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <ThemeProvider>
          <LocaleProvider locale={locale}>
            <AuthProvider>
              <SiteHeader />
              <main className="flex-1">{children}</main>
              <SiteFooter />
              <BottomNav />
              {/* useSearchParams() needs a Suspense boundary or it de-opts the whole tree to client rendering. */}
              <Suspense fallback={null}>
                <AnalyticsProvider />
              </Suspense>
              <PwaInstallHint />
            </AuthProvider>
          </LocaleProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
