/**
 * Money and head-count fields of the event form: what can be typed, and what is wrong with what was typed.
 * The website has the same rules in apps/web/src/lib/price-input.ts; change both together.
 */

/** Digits only, with an optional kopecks part ("500 грн" -> "500", "12,5" -> "12.5"). */
export function sanitizeAmount(raw: string): string {
  const cleaned = raw.replace(/,/g, ".").replace(/[^\d.]/g, "");
  const [whole = "", ...rest] = cleaned.split(".");
  const head = whole.slice(0, 7);
  if (rest.length === 0) return head;
  return head ? `${head}.${rest.join("").slice(0, 2)}` : "";
}

/** Whole numbers only (places, participants). */
export function sanitizeCount(raw: string): string {
  return raw.replace(/\D/g, "").slice(0, 6);
}

export interface PricingInput {
  priceType: string;
  price: string;
  priceMax: string;
  registrationMode: string;
  capacity: string;
  minParticipants: string;
  presetParticipants: string;
}

/** The i18n key of the first problem with the price and the places, or null. */
export function checkPricing(d: PricingInput): string | null {
  if (d.priceType === "PAID") {
    if (!(Number(d.price) > 0)) return "events.wizard.priceRequired";
    if (d.priceMax !== "" && !(Number(d.priceMax) > Number(d.price))) return "events.wizard.priceMaxTooSmall";
  }
  if (d.registrationMode === "INTERNAL") {
    const capacity = d.capacity === "" ? null : Number(d.capacity);
    if (capacity !== null && capacity < 1) return "events.wizard.capacityZero";
    if (capacity !== null && Number(d.minParticipants || 0) > capacity) return "events.wizard.minOverCapacity";
    if (capacity !== null && Number(d.presetParticipants || 0) > capacity) return "events.wizard.presetOverCapacity";
  }
  return null;
}

/** A ticket type needs both a name and a price (0 is fine); a half-filled one would otherwise be dropped silently. */
export function checkTiers(tiers: { name: string; price: string }[]): string | null {
  return tiers.some((t) => (t.name.trim() !== "") !== (t.price !== "")) ? "events.wizard.tierIncomplete" : null;
}
