"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "@/lib/locale-context";
import { useNavItems } from "@/components/nav-items";

/** Phone tab bar — the same five tabs, icons and colours as the app. On larger screens the header carries these tabs instead. */
export function BottomNav() {
  const pathname = usePathname();
  const { t } = useTranslations();
  const items = useNavItems();

  if (pathname.startsWith("/admin")) return null;

  return (
    <nav
      aria-label={t("a11y.mainNav")}
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background pb-[env(safe-area-inset-bottom)] sm:hidden"
    >
      <ul className="mx-auto flex max-w-md items-end justify-around px-1 pt-1.5 pb-1">
        {items.map(({ href, label, Icon, active, primary }) => (
          <li key={label} className="flex-1">
            <Link
              href={href}
              aria-label={label}
              aria-current={active ? "page" : undefined}
              className="flex flex-col items-center gap-0.5 py-1 text-[11px] font-medium"
            >
              <Icon className={primary ? "h-8 w-8" : "h-6 w-6"} style={{ color: active || primary ? "var(--accent-from)" : "var(--muted)" }} aria-hidden="true" />
              <span style={{ color: active ? "var(--accent-from)" : "var(--muted)" }}>{label}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
