/** The price line shown on cards and the event page: "Безкоштовно", "Донат" or "350 грн". */
export function formatPriceLabel(e: { priceType: string; price: string | null; priceMax?: string | null; currency: string }, t: (key: string) => string): string {
  if (e.priceType === "FREE") return t("common.free");
  if (e.priceType === "DONATION") return t("common.donation");
  const range = e.priceMax && e.price && Number(e.priceMax) > Number(e.price) ? `${Number(e.price)}–${Number(e.priceMax)}` : `${e.price ?? "?"}`;
  return `${range} ${formatCurrency(e.currency)}`;
}

/** Currency codes as stored/returned by the API, shown the way people actually read money in Ukraine. */
export function formatCurrency(code: string | null | undefined): string {
  if (code === "UAH") return "грн";
  return code ?? "";
}

const pad2 = (n: number) => String(n).padStart(2, "0");

/** DD.MM.YY — the date format used everywhere in the app (never the raw ISO/US format). */
export function formatShortDate(value: string | Date): string {
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "";
  return `${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}.${pad2(d.getFullYear() % 100)}`;
}

/** DD.MM.YY · HH:MM */
export function formatShortDateTime(value: string | Date): string {
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "";
  return `${formatShortDate(d)} · ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/**
 * Input mask for a Ukrainian mobile number: "+380 XX XXX XX XX". Re-derives
 * the digits from scratch on every keystroke (rather than patching the
 * previous mask), so pasting, backspacing and a leading "0" or "380" all
 * just work.
 */
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

/**
 * Input mask for a free-text date question (e.g. a custom "date of birth" registration field) —
 * DD.MM.YY, matching formatShortDate's display convention everywhere else in the app, never the
 * raw YYYY-MM-DD a plain text input would otherwise invite. The backend stores this verbatim as
 * text (no parsing/validation), so there's no ambiguity to resolve — it's just read back as-is.
 */
export function formatDateInput(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 6);
  if (!digits) return "";
  let out = digits.slice(0, 2);
  if (digits.length > 2) out += `.${digits.slice(2, 4)}`;
  if (digits.length > 4) out += `.${digits.slice(4, 6)}`;
  return out;
}
