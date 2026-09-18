/**
 * Ukrainian Cyrillic -> Latin transliteration (simplified — for URL slugs,
 * not the official passport standard) + generic slug cleanup. Used for
 * category/event slugs generated from user-entered Ukrainian titles.
 */
const CYRILLIC_TO_LATIN: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "h", ґ: "g", д: "d", е: "e", є: "ie", ж: "zh",
  з: "z", и: "y", і: "i", ї: "i", й: "i", к: "k", л: "l", м: "m", н: "n",
  о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "kh", ц: "ts",
  ч: "ch", ш: "sh", щ: "shch", ь: "", ю: "iu", я: "ia", "'": "",
};

export function slugify(input: string): string {
  const transliterated = input
    .toLowerCase()
    .split("")
    .map((char) => CYRILLIC_TO_LATIN[char] ?? char)
    .join("");

  return transliterated
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // strip accents from any other scripts
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

/**
 * Appends a short random suffix so slugs stay unique without a DB round trip
 * on every retry — callers should still handle the (rare) unique-constraint
 * race by regenerating once.
 */
export function slugifyUnique(input: string): string {
  const base = slugify(input) || "item";
  const suffix = Math.random().toString(36).slice(2, 8);
  return `${base}-${suffix}`;
}
