/**
 * Input mask for a Ukrainian mobile number: "+380 XX XXX XX XX". Mirrors the mobile app's
 * formatPhoneInput (apps/mobile/src/lib/format.ts) so a phone number looks the same on both
 * platforms. Re-derives the digits from scratch on every keystroke, so pasting, backspacing and
 * a leading "0" or "380" all just work.
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
