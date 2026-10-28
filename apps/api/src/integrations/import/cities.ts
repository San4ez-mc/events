export interface CityRow {
  id: string;
  nameUk: string;
  nameEn: string;
}

const norm = (s: string) => s.toLowerCase().replace(/[’'`ʼ]/g, "'").replace(/^м\.\s*/, "").replace(/\s+/g, " ").trim();

/** Exact (case/prefix-insensitive) match of a city name from a source against the cities we run. */
export function matchCity(name: string | null | undefined, cities: CityRow[]): CityRow | null {
  if (!name) return null;
  const n = norm(name);
  return cities.find((c) => norm(c.nameUk) === n || norm(c.nameEn) === n) ?? null;
}

/**
 * For sources that give a venue but no city (ottry): explicit city names, then streets/venues that exist in one city only.
 * Deliberately short: an unknown venue is skipped (and reported) rather than guessed.
 */
const CITY_HINTS: Array<{ city: string; pattern: RegExp }> = [
  { city: "Київ", pattern: /київ|kyiv|kiev|нижньоюрківськ|прорізн|антоновича|велика васильківськ|голосіївськ|паньківськ|мечнікова|князів острозьких|кловськ|хрещатик|саксаганського|федорова|площа ангелів/i },
  { city: "Львів", pattern: /львів|lviv|жовківськ|вітовського/i },
  { city: "Полтава", pattern: /полтав|poltava/i },
  { city: "Івано-Франківськ", pattern: /івано-франківськ|ivano-frankivsk/i },
  { city: "Одеса", pattern: /одес|odesa|odessa/i },
  { city: "Харків", pattern: /харків|kharkiv/i },
  { city: "Дніпро", pattern: /дніпро|dnipro/i },
];

export function hintCity(...texts: Array<string | null | undefined>): string | null {
  const text = texts.filter(Boolean).join(" ");
  return CITY_HINTS.find((h) => h.pattern.test(text))?.city ?? null;
}
