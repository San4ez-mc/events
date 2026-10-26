import type { ApiRequestError } from "@/lib/auth-context";

/** Form field name (as the API reports it) → i18n key of the label the person sees next to it. */
const FIELD_LABELS: Record<string, string> = {
  title: "events.wizard.title",
  description: "events.wizard.description",
  categoryId: "events.wizard.category",
  format: "events.wizard.format",
  startsAt: "events.wizard.startsAt",
  endsAt: "events.wizard.endsAt",
  cityId: "events.wizard.city",
  districtId: "events.wizard.district",
  addressText: "events.wizard.addressText",
  onlineUrl: "events.wizard.onlineUrl",
  youtubeUrl: "events.wizard.youtubeUrl",
  priceType: "events.wizard.priceType",
  price: "events.wizard.priceAmount",
  priceMax: "events.wizard.priceMax",
  capacity: "events.wizard.capacity",
  minParticipants: "events.wizard.minParticipants",
  presetParticipants: "events.wizard.presetParticipants",
  approvalMode: "events.wizard.approvalMode",
  registrationMode: "events.wizard.registrationMode",
  externalRegistrationUrl: "events.wizard.externalUrl",
  registrationDeadline: "events.wizard.registrationDeadline",
  paymentUrl: "events.wizard.paymentUrl",
  rules: "events.wizard.rules",
  visibility: "events.wizard.visibility",
};

/**
 * One readable message for a failed request: the generic text for the error code, plus WHICH fields the API
 * rejected (`details`) so the person knows what to fix. `fallbackLabel` names the section for list-type fields
 * the API reports by index (`items.0.price`).
 */
export function describeApiError(err: ApiRequestError, t: (key: string) => string, fallbackLabel?: string): string {
  const generic = t(`errors.${err.code}`);
  const details = err.details;
  if (!details) return generic;

  const label = (field: string): string => {
    const key = FIELD_LABELS[field];
    if (key) return t(key);
    return fallbackLabel ?? field;
  };

  // Publish: `_` lists fields that are still empty.
  if (Array.isArray(details._) && details._.length > 0) {
    return `${t("create.missingFields")}: ${[...new Set(details._.map(label))].join(", ")}`;
  }
  if (Array.isArray(details.startsAt) && details.startsAt.length > 0 && err.message.includes("future")) return t("create.startsAtPast");

  const invalid = Object.keys(details).filter((k) => Array.isArray(details[k]) && details[k].length > 0);
  if (invalid.length > 0) {
    return `${t("create.invalidFields")}: ${[...new Set(invalid.map(label))].join(", ")}`;
  }
  return generic;
}
