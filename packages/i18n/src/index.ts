import uk from "./locales/uk/common.json";
import en from "./locales/en/common.json";

/** Supported UI locales (§45, §84). Content created by users is never auto-translated. */
export const SUPPORTED_LOCALES = ["uk", "en"] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];
export const DEFAULT_LOCALE: SupportedLocale = "uk";

/**
 * i18next-shaped resource bundle, shared verbatim between the Next.js web app
 * and the Expo mobile app so translation keys can never drift between them.
 * Each app wires this into its own i18next instance (web needs SSR-safe init,
 * mobile needs expo-localization for device locale detection).
 */
export const i18nResources = {
  uk: { common: uk },
  en: { common: en },
} as const;

export function isSupportedLocale(value: string): value is SupportedLocale {
  return (SUPPORTED_LOCALES as readonly string[]).includes(value);
}
