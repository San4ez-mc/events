import { i18nResources, type SupportedLocale } from "@kiro/i18n";

/**
 * Plain-function counterpart to useTranslations() — no React context, so it
 * works in Server Components too (needed for the SEO-critical public event
 * page, which must be server-rendered per §62, not client-rendered).
 */
export function getT(locale: SupportedLocale): (key: string) => string {
  return (key: string) => {
    const value = key.split(".").reduce<unknown>((acc, segment) => {
      if (acc && typeof acc === "object" && segment in acc) {
        return (acc as Record<string, unknown>)[segment];
      }
      return undefined;
    }, i18nResources[locale].common);
    return typeof value === "string" ? value : key;
  };
}
