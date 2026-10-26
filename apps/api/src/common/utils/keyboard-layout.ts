/** Ukrainian ЙЦУКЕН keys sitting on the QWERTY keys, so "nthyj" (typed on the wrong layout) reads as "терно". */
const QWERTY_TO_UK: Record<string, string> = {
  q: "й", w: "ц", e: "у", r: "к", t: "е", y: "н", u: "г", i: "ш", o: "щ", p: "з", "[": "х", "]": "ї",
  a: "ф", s: "і", d: "в", f: "а", g: "п", h: "р", j: "о", k: "л", l: "д", ";": "ж", "'": "є",
  z: "я", x: "ч", c: "с", v: "м", b: "и", n: "т", m: "ь", ",": "б", ".": "ю", "`": "ґ",
};

/**
 * Re-reads text typed with the English layout active as Ukrainian. Returns null when the text isn't plausibly that
 * (contains non-Latin letters, or has no letters at all) so callers only retry when it can make a difference.
 */
export function fixKeyboardLayout(text: string): string | null {
  const trimmed = text.trim().toLowerCase();
  if (!/^[a-z\[\];',.` ]+$/.test(trimmed) || !/[a-z]/.test(trimmed)) return null;
  const fixed = [...trimmed].map((ch) => QWERTY_TO_UK[ch] ?? ch).join("");
  return fixed === trimmed ? null : fixed;
}
