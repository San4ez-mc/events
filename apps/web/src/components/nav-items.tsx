"use client";

import type { IconType } from "react-icons";
import { IoAddCircle, IoCompass, IoHeart, IoPerson, IoSearch } from "react-icons/io5";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useTranslations } from "@/lib/locale-context";

export interface NavItem {
  href: string;
  label: string;
  Icon: IconType;
  active: boolean;
  /** The "create" tab: drawn as a raised accent button on the phone tab bar. */
  primary?: boolean;
}

/** The same five tabs as the app's bottom bar (Discover / Search / Create / Saved / Profile) — used by both the phone tab bar and the desktop header. */
export function useNavItems(): NavItem[] {
  const pathname = usePathname();
  const { user } = useAuth();
  const { t } = useTranslations();

  return [
    { href: "/", label: t("nav.discover"), Icon: IoCompass, active: pathname === "/" },
    { href: "/search", label: t("nav.search"), Icon: IoSearch, active: pathname.startsWith("/search") },
    { href: "/organizer/events/new", label: t("nav.create"), Icon: IoAddCircle, active: pathname.startsWith("/organizer/events/new"), primary: true },
    { href: user ? "/saved" : "/login", label: t("nav.saved"), Icon: IoHeart, active: pathname.startsWith("/saved") },
    {
      href: user ? `/users/${user.id}` : "/login",
      label: t("nav.profile"),
      Icon: IoPerson,
      active: pathname.startsWith("/users") || pathname === "/login",
    },
  ];
}
