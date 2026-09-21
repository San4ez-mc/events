"use client";

import { createContext, useCallback, useContext, useMemo } from "react";
import type { SupportedLocale } from "@kiro/i18n";
import { getT } from "./i18n-server";
import { LOCALE_COOKIE } from "./locale";

interface LocaleContextValue {
  locale: SupportedLocale;
  /** Dot-path lookup into the "common" namespace, e.g. t("auth.login.title"). */
  t: (key: string) => string;
  setLocale: (locale: SupportedLocale) => void;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function LocaleProvider({
  locale,
  children,
}: {
  locale: SupportedLocale;
  children: React.ReactNode;
}) {
  const t = useCallback((key: string) => getT(locale)(key), [locale]);

  const setLocale = useCallback((next: SupportedLocale) => {
    document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
    window.location.reload();
  }, []);

  const value = useMemo(() => ({ locale, t, setLocale }), [locale, t, setLocale]);

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useTranslations(): LocaleContextValue {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error("useTranslations must be used within LocaleProvider");
  return ctx;
}
