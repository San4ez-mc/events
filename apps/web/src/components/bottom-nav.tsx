"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Compass, Heart, Plus, Search, User } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useTranslations } from "@/lib/locale-context";

/** Phone-only tab bar (UX §64): the top nav links are hidden below `sm`, so this is the only navigation there. */
export function BottomNav() {
  const pathname = usePathname();
  const { user } = useAuth();
  const { t } = useTranslations();

  if (pathname.startsWith("/admin")) return null;

  const items = [
    { href: "/", label: t("nav.discover"), Icon: Compass, active: pathname === "/" },
    { href: "/search", label: t("nav.search"), Icon: Search, active: pathname.startsWith("/search") },
    { href: "/organizer/events/new", label: t("nav.create"), Icon: Plus, active: false, primary: true },
    { href: user ? "/saved" : "/login", label: t("nav.saved"), Icon: Heart, active: pathname.startsWith("/saved") },
    {
      href: user ? `/users/${user.id}` : "/login",
      label: t("nav.profile"),
      Icon: User,
      active: pathname.startsWith("/users") || pathname === "/login",
    },
  ];

  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur sm:hidden"
    >
      <ul className="mx-auto flex max-w-md items-end justify-around px-2 py-1.5">
        {items.map(({ href, label, Icon, active, primary }) => (
          <li key={label}>
            <Link
              href={href}
              aria-label={label}
              aria-current={active ? "page" : undefined}
              className="flex flex-col items-center gap-0.5 px-3 py-1 text-[11px] font-medium"
            >
              {primary ? (
                <span className="accent-gradient -mt-5 flex h-12 w-12 items-center justify-center rounded-full text-white shadow-lg">
                  <Icon className="h-6 w-6" strokeWidth={2.5} />
                </span>
              ) : (
                <Icon className={`h-6 w-6 ${active ? "text-accent" : "text-muted"}`} strokeWidth={active ? 2.5 : 2} />
              )}
              <span className={active ? "text-accent" : "text-muted"}>{label}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
