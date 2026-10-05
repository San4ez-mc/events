/**
 * Input mask for a Ukrainian mobile number: "+380 XX XXX XX XX". Mirrors the mobile app's
 * formatPhoneInput (apps/mobile/src/lib/format.ts) so a phone number looks the same on both
 * platforms. Re-derives the digits from scratch on every keystroke, so pasting, backspacing and
 * a leading "0" or "380" all just work.
 */
/**
 * Currency codes as stored/returned by the API, shown the way people actually read money in
 * Ukraine. Mirrors the mobile app's formatCurrency (apps/mobile/src/lib/format.ts).
 */
export function formatCurrency(code: string | null | undefined): string {
  if (code === "UAH") return "грн";
  return code ?? "";
}

export function formatPhoneInput(raw: string): string {
  let digits = raw.replace(/\D/g, "");
  if (digits.startsWith("380")) digits = digits.slice(3);
  else if (digits.startsWith("0")) digits = digits.slice(1);
  digits = digits.slice(0, 9);
  if (!digits) return "";
  let out = `+380 ${digits.slice(0, 2)}`;
  if (digits.length > 2) out += ` ${digits.slice(2, 5)}`;
  if (digits.length > 5) out += ` ${digits.slice(5, 7)}`;
  if (digits.length > 7) out += ` ${digits.slice(7, 9)}`;
  return out;
}

/** Plural form for `n` ("1 кредит", "2 кредити", "5 кредитів"). `forms.few` is only used by Ukrainian. */
export function pluralForm(n: number, locale: string, forms: { one: string; few?: string; many: string }): string {
  const rule = new Intl.PluralRules(locale === "uk" ? "uk" : "en").select(n);
  if (rule === "one") return forms.one;
  if (rule === "few") return forms.few ?? forms.many;
  return forms.many;
}

/** `t()` returns the key itself when it is missing; for enum-like backend values, fall back to the raw value instead. */
export function tEnum(t: (key: string) => string, group: string, value: string | null | undefined): string {
  if (!value) return "";
  const key = `enums.${group}.${value}`;
  const out = t(key);
  return out === key ? value : out;
}

/** DB package names were seeded in English ("1 publication"); render them from the credit count instead. */
export function creditPackageName(pkg: { name: string; credits: number }, t: (key: string) => string): string {
  const key = `credits.package.${pkg.credits}`;
  const out = t(key);
  return out === key ? pkg.name : out;
}

/** Locale-aware date+time ("01.10.2026, 00:48"), never the browser's own locale. */
export function formatDateTime(value: string | Date, locale: string): string {
  return new Date(value).toLocaleString(locale === "uk" ? "uk-UA" : "en-GB", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

/** "350" or, for a price range, "300–2700" (price is the lowest price, priceMax the highest). */
export function formatPriceAmount(price: string | null | undefined, priceMax?: string | null): string {
  if (price && priceMax && Number(priceMax) > Number(price)) return `${Number(price)}–${Number(priceMax)}`;
  return price ?? "?";
}

/** Every event is shown in Kyiv time (the platform is Ukraine-only); pages that render on the server would otherwise show UTC. */
export const EVENT_TZ = "Europe/Kyiv";
