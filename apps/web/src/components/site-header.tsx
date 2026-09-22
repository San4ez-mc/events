"use client";

import Link from "next/link";
import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useTranslations } from "@/lib/locale-context";
import { useTheme } from "@/lib/theme-context";
import { NotificationBell } from "@/components/notifications/notification-bell";

export function SiteHeader() {
  const { user, logout, isLoading } = useAuth();
  const { t, locale, setLocale } = useTranslations();
  const { theme, setTheme } = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
        <Link href="/" className="text-lg font-bold accent-gradient-text" aria-label="Кіро">
          Кіро
        </Link>

        <nav className="hidden items-center gap-6 text-sm font-medium sm:flex">
          <Link href="/" className="hover:opacity-80">
            {t("nav.discover")}
          </Link>
          <Link href="/search" className="hover:opacity-80">
            {t("nav.search")}
          </Link>
          {user && (
            <Link href="/saved" className="hover:opacity-80">
              {t("nav.saved")}
            </Link>
          )}
          <Link href="/organizer/events" className="hover:opacity-80">
            {t("nav.organizer")}
          </Link>
        </nav>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setLocale(locale === "uk" ? "en" : "uk")}
            className="rounded-md border border-border px-2 py-1 text-xs font-medium uppercase hover:bg-surface"
            aria-label="Change language"
          >
            {locale}
          </button>

          <button
            type="button"
            onClick={() => setTheme(theme === "dark" ? "light" : theme === "light" ? "system" : "dark")}
            className="rounded-md border border-border px-2 py-1 text-xs hover:bg-surface"
            aria-label="Change theme"
            title={`Theme: ${theme}`}
          >
            {theme === "dark" ? "🌙" : theme === "light" ? "☀️" : "🖥️"}
          </button>

          <NotificationBell />

          {!isLoading && !user && (
            <Link
              href="/login"
              className="rounded-md accent-gradient px-3 py-1.5 text-sm font-semibold text-white hover:opacity-90"
            >
              {t("auth.login.title")}
            </Link>
          )}

          {!isLoading && user && (
            <div className="relative">
              <button
                type="button"
                onClick={() => setMenuOpen((open) => !open)}
                className="flex h-8 w-8 items-center justify-center rounded-full accent-gradient text-sm font-semibold text-white"
                aria-haspopup="menu"
                aria-expanded={menuOpen}
              >
                {(user.name ?? user.nickname ?? user.email).slice(0, 1).toUpperCase()}
              </button>
              {menuOpen && (
                <div
                  role="menu"
                  className="absolute right-0 mt-2 w-48 rounded-lg border border-border bg-background py-1 shadow-lg"
                >
                  <Link
                    href="/saved"
                    role="menuitem"
                    className="block px-4 py-2 text-sm hover:bg-surface sm:hidden"
                    onClick={() => setMenuOpen(false)}
                  >
                    {t("nav.saved")}
                  </Link>
                  <Link
                    href="/my-registrations"
                    role="menuitem"
                    className="block px-4 py-2 text-sm hover:bg-surface"
                    onClick={() => setMenuOpen(false)}
                  >
                    {t("nav.myRegistrations")}
                  </Link>
                  <Link
                    href="/organizer/events"
                    role="menuitem"
                    className="block px-4 py-2 text-sm hover:bg-surface"
                    onClick={() => setMenuOpen(false)}
                  >
                    {t("nav.myEvents")}
                  </Link>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false);
                      void logout();
                    }}
                    className="block w-full px-4 py-2 text-left text-sm hover:bg-surface"
                  >
                    {t("auth.logout")}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
