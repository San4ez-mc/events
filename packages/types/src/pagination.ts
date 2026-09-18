/**
 * Cursor pagination envelope used by every list endpoint (§57: no `page=500`
 * offset pagination for feeds).
 */
export interface CursorPage<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface CursorPageQuery {
  cursor?: string;
  limit?: number;
}
