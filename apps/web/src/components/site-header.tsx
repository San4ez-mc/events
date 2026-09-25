"use client";

import Link from "next/link";
import { useState } from "react";
import { Globe, Monitor, Moon, Sun } from "lucide-react";
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
        <Link href="/" className="flex items-center gap-2" aria-label="Кіро">
          {/* eslint-disable-next-line @next/next/no-img-element -- tiny static brand mark */}
          <img
            src="/logo-mark.png"
            alt=""
            width={32}
            height={32}
            className="h-8 w-8 rounded-lg"
          />
          <span className="text-lg font-bold accent-gradient-text">Кіро</span>
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
            className="flex h-9 items-center gap-1.5 rounded-full border border-border px-3 text-xs font-semibold uppercase hover:bg-surface"
            aria-label="Change language"
          >
            <Globe className="h-4 w-4" aria-hidden="true" />
            {locale}
          </button>

          <button
            type="button"
            onClick={() =>
              setTheme(
                theme === "dark"
                  ? "light"
                  : theme === "light"
                    ? "system"
                    : "dark",
              )
            }
            className="flex h-9 w-9 items-center justify-center rounded-full border border-border hover:bg-surface"
            aria-label="Change theme"
            title={`Theme: ${theme}`}
          >
            {theme === "dark" ? (
              <Moon className="h-4 w-4" />
            ) : theme === "light" ? (
              <Sun className="h-4 w-4" />
            ) : (
              <Monitor className="h-4 w-4" />
            )}
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
                {(user.name ?? user.nickname ?? user.email)
                  .slice(0, 1)
                  .toUpperCase()}
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
                    href="/friends"
                    role="menuitem"
                    className="block px-4 py-2 text-sm hover:bg-surface"
                    onClick={() => setMenuOpen(false)}
                  >
                    {t("friends.title")}
                  </Link>
                  <Link
                    href="/invitations"
                    role="menuitem"
                    className="block px-4 py-2 text-sm hover:bg-surface"
                    onClick={() => setMenuOpen(false)}
                  >
                    {t("invitations.title")}
                  </Link>
                  <Link
                    href={`/users/${user.id}`}
                    role="menuitem"
                    className="block px-4 py-2 text-sm hover:bg-surface"
                    onClick={() => setMenuOpen(false)}
                  >
                    {t("nav.profile")}
                  </Link>
                  <Link
                    href="/organizer/events"
                    role="menuitem"
                    className="block px-4 py-2 text-sm hover:bg-surface"
                    onClick={() => setMenuOpen(false)}
                  >
                    {t("nav.myEvents")}
                  </Link>
                  {["MODERATOR", "ADMIN", "SUPER_ADMIN"].includes(
                    user.role,
                  ) && (
                    <Link
                      href="/admin"
                      role="menuitem"
                      className="block px-4 py-2 text-sm hover:bg-surface"
                      onClick={() => setMenuOpen(false)}
                    >
                      {t("nav.admin")}
                    </Link>
                  )}
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
