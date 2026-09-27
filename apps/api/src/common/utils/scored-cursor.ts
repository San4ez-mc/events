/**
 * Cursor pagination over a list ranked by a computed score rather than a
 * single DB column (discovery feed §58, search relevance) — used instead of
 * offset pagination (§57 explicitly forbids `page=500` for feeds), and
 * instead of a DB-level keyset cursor because the score itself is computed
 * in application code, not stored.
 */
export interface ScoredCursor {
  score: number;
  id: string;
  /**
   * Epoch ms of the `now` used to compute `score`, when the score is time-
   * dependent (the discovery feed's freshness/proximity terms) — `null` for
   * a time-independent score (search relevance). See `now` below.
   */
  now: number | null;
}

/**
 * `now` should be passed whenever the score was computed against a `now`
 * that drifts on every call (e.g. discovery's freshness/date-proximity
 * terms) — the caller must then reuse that same `now` (not a fresh
 * `new Date()`) for every subsequent page in the same pagination session,
 * or a page boundary can flip between requests and silently duplicate or
 * skip an item near it. Omit it for a score that's already stable across
 * requests (e.g. search's trigram relevance).
 */
export function encodeScoredCursor(score: number, id: string, now?: number): string {
  return Buffer.from(`${score}:${now ?? ""}:${id}`, "utf8").toString("base64url");
}

export function decodeScoredCursor(cursor: string): ScoredCursor | null {
  try {
    const decoded = Buffer.from(cursor, "base64url").toString("utf8");
    const first = decoded.indexOf(":");
    const last = decoded.lastIndexOf(":");
    // A cursor with only one ":" is either corrupt or from the old 2-part (score:id) format —
    // either way, degrading to "no cursor" (start over) is safe; nothing downstream crashes on it.
    if (first === -1 || last === -1 || first === last) return null;
    const score = Number(decoded.slice(0, first));
    const nowPart = decoded.slice(first + 1, last);
    const id = decoded.slice(last + 1);
    if (!Number.isFinite(score) || !id) return null;
    const now = nowPart ? Number(nowPart) : null;
    return { score, id, now: now != null && Number.isFinite(now) ? now : null };
  } catch {
    return null;
  }
}

/**
 * `items` must already be sorted score DESC, id ASC (the same order the
 * cursor was minted from). Returns the items strictly after the cursor
 * position. If the cursor's item is no longer present (passed/deleted since
 * it was minted), falls back to a pure score/id comparison so pagination
 * degrades gracefully instead of restarting from the top or erroring.
 */
export function sliceAfterScoredCursor<T extends { id: string; score: number }>(
  items: T[],
  cursor: ScoredCursor | null,
): T[] {
  if (!cursor) return items;
  const index = items.findIndex((item) => item.score === cursor.score && item.id === cursor.id);
  if (index !== -1) return items.slice(index + 1);
  return items.filter(
    (item) => item.score < cursor.score || (item.score === cursor.score && item.id > cursor.id),
  );
}
