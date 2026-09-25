"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useTranslations } from "@/lib/locale-context";

const ADMIN_ROLES = ["MODERATOR", "ADMIN", "SUPER_ADMIN"];

const NAV_ITEMS: { href: string; labelKey: string }[] = [
  { href: "/admin", labelKey: "admin.nav.dashboard" },
  { href: "/admin/moderation", labelKey: "admin.nav.moderation" },
  { href: "/admin/reports", labelKey: "admin.nav.reports" },
  { href: "/admin/users", labelKey: "admin.nav.users" },
  { href: "/admin/events", labelKey: "admin.nav.events" },
  { href: "/admin/reviews", labelKey: "admin.nav.reviews" },
  { href: "/admin/categories", labelKey: "admin.nav.categories" },
  { href: "/admin/districts", labelKey: "admin.nav.districts" },
  { href: "/admin/payments", labelKey: "admin.nav.payments" },
  { href: "/admin/credits", labelKey: "admin.nav.credits" },
  { href: "/admin/audit", labelKey: "admin.nav.audit" },
];

/** §72/§73 — every `/admin/*` page. Phone-friendly: a horizontally-scrolling tab strip instead of a fixed sidebar. Server-side RBAC (RolesGuard) is the real gate; this is just UX. */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const { t } = useTranslations();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (isLoading) return;
    if (!user || !ADMIN_ROLES.includes(user.role)) {
      router.replace("/");
    }
  }, [isLoading, user, router]);

  if (isLoading || !user || !ADMIN_ROLES.includes(user.role)) {
    return <div className="mx-auto max-w-3xl px-4 py-16 text-center text-muted">{t("admin.accessDenied")}</div>;
  }

  return (
    <div>
      <nav className="sticky top-[57px] z-30 overflow-x-auto border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl gap-1 px-4 py-2 text-sm">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`shrink-0 rounded-md px-3 py-1.5 font-medium whitespace-nowrap ${
                pathname === item.href ? "accent-gradient text-white" : "hover:bg-surface"
              }`}
            >
              {t(item.labelKey)}
            </Link>
          ))}
        </div>
      </nav>
      {children}
    </div>
  );
}
