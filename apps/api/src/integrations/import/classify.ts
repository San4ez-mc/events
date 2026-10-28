import type { ExternalEvent } from "./types";

/** Category slug from what the listing says. Order matters: the most specific words first. */
export function classify(text: string, typeHint?: string, fallback: ExternalEvent["categorySlug"] = "culture"): ExternalEvent["categorySlug"] {
  const t = text.toLowerCase();
  if (/стендап|stand-?up|стенд-ап/.test(t)) return "standup";
  if (/йога|yoga|sound healing/.test(t)) return "sport-yoga";
  if (/дитяч|для дітей|казк/.test(t)) return "kids";
  if (/кінопоказ|кіно|кінотеатр/.test(t) && !/концерт/.test(t)) return "cinema";
  if (/майстер-?клас/.test(t)) return "workshops";
  if (/швидкі побачення|speed ?dating/.test(t)) return "dating";
  if (/концерт|live\b|гурт|музична сесія|music session|showcase|квартирник|оркестр|джаз|jazz|симфон/.test(t)) return "concerts";
  if (/вистава|театр|опера|балет|виставка|екскурс|музей|літератур|поетичн/.test(t)) return "culture";
  if (/party|вечірк|rave|рейв|halloween|хелловін|геловін|club|клуб|dj\b|disco|дискотек/.test(t)) return "parties";
  if (typeHint === "MusicEvent") return "concerts";
  if (typeHint === "TheaterEvent") return "culture";
  if (typeHint === "ComedyEvent") return "standup";
  return fallback;
}

/** Not for a general audience: professional conferences and the like. */
export const EXCLUDE_TITLE = /forum|форум|конференц|conference|вебінар|webinar|tender|тендер/i;
