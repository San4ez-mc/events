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
}

export function encodeScoredCursor(score: number, id: string): string {
  return Buffer.from(`${score}:${id}`, "utf8").toString("base64url");
}

export function decodeScoredCursor(cursor: string): ScoredCursor | null {
  try {
    const decoded = Buffer.from(cursor, "base64url").toString("utf8");
    const separatorIndex = decoded.lastIndexOf(":");
    if (separatorIndex === -1) return null;
    const score = Number(decoded.slice(0, separatorIndex));
    const id = decoded.slice(separatorIndex + 1);
    if (!Number.isFinite(score) || !id) return null;
    return { score, id };
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
