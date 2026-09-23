import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import { DEFAULT_LOCALE, i18nResources, isSupportedLocale, type SupportedLocale } from "@kiro/i18n";

const LOCALE_KEY = "kiro_locale";

interface LocaleContextValue {
  locale: SupportedLocale;
  setLocale: (locale: SupportedLocale) => void;
  t: (key: string) => string;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

/** UX §64/§84 — uk/en labels, same resource bundle as web (packages/i18n) so keys can never drift. */
export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<SupportedLocale>(DEFAULT_LOCALE);

  useEffect(() => {
    (async () => {
      const stored = Platform.OS === "web" ? localStorage?.getItem(LOCALE_KEY) : await SecureStore.getItemAsync(LOCALE_KEY);
      if (stored && isSupportedLocale(stored)) setLocaleState(stored);
    })();
  }, []);

  const setLocale = useCallback((next: SupportedLocale) => {
    setLocaleState(next);
    if (Platform.OS === "web") localStorage?.setItem(LOCALE_KEY, next);
    else void SecureStore.setItemAsync(LOCALE_KEY, next);
  }, []);

  const t = useCallback(
    (key: string): string => {
      const value = key.split(".").reduce<unknown>((acc, segment) => {
        if (acc && typeof acc === "object" && segment in acc) return (acc as Record<string, unknown>)[segment];
        return undefined;
      }, i18nResources[locale].common);
      return typeof value === "string" ? value : key;
    },
    [locale],
  );

  const value = useMemo(() => ({ locale, setLocale, t }), [locale, setLocale, t]);

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useTranslations(): LocaleContextValue {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error("useTranslations must be used within LocaleProvider");
  return ctx;
}
