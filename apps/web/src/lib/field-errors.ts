/** Per-field validation errors from the API: `{ field: ["isUrl", ...] }` (nested fields as "links.0.url"). */
export type FieldErrors = Record<string, string[]>;

/** Reads the `error.details` of a failed response (empty when the body isn't a validation error). The `_` key holds raw messages — skipped. */
export async function readFieldErrors(res: Response): Promise<FieldErrors> {
  try {
    const body = (await res.clone().json()) as { error?: { code?: string; details?: FieldErrors } };
    if (body.error?.code !== "VALIDATION_ERROR" || !body.error.details) return {};
    return Object.fromEntries(Object.entries(body.error.details).filter(([key, v]) => key !== "_" && Array.isArray(v)));
  } catch {
    return {};
  }
}

/** A readable, translated reason for the first failed rule of a field. */
export function fieldErrorMessage(t: (key: string) => string, field: string, rules: string[]): string {
  const rule = rules[0] ?? "unknown";
  if (field === "phone" && rule === "matches") return t("errors.fields.phoneInvalid");
  if (field === "nickname" && rule === "matches") return t("errors.fields.nicknameInvalid");
  const key = `errors.fields.${rule}`;
  const text = t(key);
  return text === key ? t("errors.fields.unknown") : text;
}
