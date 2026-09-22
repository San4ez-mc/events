import { Injectable } from "@nestjs/common";
import type { ModerationReasonCode } from "@kiro/types";

export type ContentScanResult =
  | { decision: "ALLOW" }
  | { decision: "FLAG"; reasonCode: ModerationReasonCode; matchedTerm: string }
  | { decision: "REJECT"; reasonCode: ModerationReasonCode; matchedTerm: string };

/**
 * §54 — first-pass keyword scan, deliberately narrow and explicitly NOT the
 * final word (spec: "Do not rely only on keyword matching for final
 * moderation decision" — a human moderator resolves every FLAG via
 * ModerationCase in Phase 10's admin queue). Matches on word boundaries
 * against title+description+rules, case-insensitive.
 *
 * Word boundaries use `(?<![\p{L}\p{N}])`/`(?![\p{L}\p{N}])`, not `\b` —
 * JS regex's `\b` is defined in terms of `\w`, which is ASCII-only even
 * with the `u` flag, so it silently fails to find a boundary next to
 * Cyrillic text (found via a failing test: "війни" didn't match `\bвійн[аи]\b`).
 *
 * Two tiers:
 *  - REJECT: illegal goods/services (drugs, weapons sale, explosives,
 *    sexual services) — publish is blocked outright, no moderation queue.
 *  - FLAG: war-related content — publish is held as PENDING_MODERATION
 *    pending manual review, not blocked.
 * Adult-themed-but-legal content (§54: "adult educational events may be
 * allowed") is deliberately NOT auto-flagged here — that's what the
 * organizer's own `ageRestriction` field is for, not a content-scan concern.
 */
@Injectable()
export class SensitiveContentService {
  private readonly rejectPatterns: { pattern: RegExp; reasonCode: ModerationReasonCode }[] = [
    { pattern: /продаж(у)?\s+збро[їі]/iu, reasonCode: "SENSITIVE_KEYWORDS" },
    { pattern: /купити\s+збро[юї]/iu, reasonCode: "SENSITIVE_KEYWORDS" },
    { pattern: /вибухівк[аиу]/iu, reasonCode: "SENSITIVE_KEYWORDS" },
    { pattern: /порнограф[іi][яюї]/iu, reasonCode: "SENSITIVE_KEYWORDS" },
    { pattern: /секс[- ]?послуг/iu, reasonCode: "SENSITIVE_KEYWORDS" },
    { pattern: /проституц[іi][яюї]/iu, reasonCode: "SENSITIVE_KEYWORDS" },
    { pattern: /наркотик(и|ів|ами)?\s+(продаж|купити|доставка)/iu, reasonCode: "SENSITIVE_KEYWORDS" },
    { pattern: /\bescort\s+service\b/iu, reasonCode: "SENSITIVE_KEYWORDS" },
    { pattern: /\bdrugs?\s+for\s+sale\b/iu, reasonCode: "SENSITIVE_KEYWORDS" },
  ];

  private readonly flagPatterns: { pattern: RegExp; reasonCode: ModerationReasonCode }[] = [
    { pattern: /(?<![\p{L}\p{N}])війн[аи](?![\p{L}\p{N}])/iu, reasonCode: "WAR_RELATED" },
    { pattern: /воєнн(ий|а|і)/iu, reasonCode: "WAR_RELATED" },
    { pattern: /окупаці[їі]/iu, reasonCode: "WAR_RELATED" },
    { pattern: /(?<![\p{L}\p{N}])зсу(?![\p{L}\p{N}])/iu, reasonCode: "WAR_RELATED" },
    { pattern: /мобілізаці[їі]/iu, reasonCode: "WAR_RELATED" },
    { pattern: /(?<![\p{L}\p{N}])фронт(і|у)?(?![\p{L}\p{N}])/iu, reasonCode: "WAR_RELATED" },
  ];

  scan(...textParts: (string | null | undefined)[]): ContentScanResult {
    const text = textParts.filter(Boolean).join("\n");
    if (!text) return { decision: "ALLOW" };

    for (const { pattern, reasonCode } of this.rejectPatterns) {
      const match = pattern.exec(text);
      if (match) return { decision: "REJECT", reasonCode, matchedTerm: match[0] };
    }

    for (const { pattern, reasonCode } of this.flagPatterns) {
      const match = pattern.exec(text);
      if (match) return { decision: "FLAG", reasonCode, matchedTerm: match[0] };
    }

    return { decision: "ALLOW" };
  }
}
