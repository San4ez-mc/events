import { DEFAULT_LOCALE, isSupportedLocale, type SupportedLocale } from "@kiro/i18n";

// No "use client" here deliberately — these are plain functions/constants
// that both the root layout (Server Component) and client components need
// to call directly. Anything exported from a "use client" file becomes a
// client reference that a Server Component can't invoke as a function
// (only render as JSX), so this logic can't live in locale-context.tsx.

export const LOCALE_COOKIE = "kiro_locale";

export function resolveLocale(cookieValue: string | undefined): SupportedLocale {
  return cookieValue && isSupportedLocale(cookieValue) ? cookieValue : DEFAULT_LOCALE;
}
