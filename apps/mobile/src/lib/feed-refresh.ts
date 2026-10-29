/**
 * The Discover tab loads its card stack once and stays mounted, so an event published from the Create tab
 * only showed up after "Look again". Publishing marks the feed stale; the tab reloads it the next time it gets focus.
 */
let stale = false;

export function markFeedStale(): void {
  stale = true;
}

/** True once per `markFeedStale()`. */
export function consumeFeedStale(): boolean {
  const was = stale;
  stale = false;
  return was;
}
