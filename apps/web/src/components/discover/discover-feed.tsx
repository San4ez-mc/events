"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useTranslations } from "@/lib/locale-context";
import { getAccessToken } from "@/lib/api-client";
import type { CursorPage, EventCard as EventCardData } from "@/lib/event-types";
import { Button } from "@/components/ui/button";
import { EventCard } from "./event-card";
import { DiscoverFilters, type DiscoveryFilters } from "./discover-filters";

const EMPTY_FILTERS: DiscoveryFilters = { cityId: null, categoryId: null, freeOnly: false };

function buildQuery(filters: DiscoveryFilters, cursor: string | null): string {
  const params = new URLSearchParams();
  if (filters.cityId) params.set("cityIds", filters.cityId);
  if (filters.categoryId) params.set("categoryIds", filters.categoryId);
  if (filters.freeOnly) params.set("freeOnly", "true");
  if (cursor) params.set("cursor", cursor);
  return params.toString();
}

/**
 * UX §3-8 — the Tinder-style discovery feed. One card at a time, big
 * bottom buttons (undo / pass / save / open) rather than requiring a touch
 * swipe gesture, since the buttons are a required control regardless (UX §4
 * — "icons must be large and clear") and are far more reliable on desktop
 * web than an emulated drag gesture.
 */
export function DiscoverFeed() {
  const { t, locale } = useTranslations();
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();

  const [filters, setFilters] = useState<DiscoveryFilters>(EMPTY_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [items, setItems] = useState<EventCardData[]>([]);
  const [index, setIndex] = useState(0);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const fetchingRef = useRef(false);

  const fetchPage = useCallback(
    async (targetFilters: DiscoveryFilters, targetCursor: string | null, reset: boolean) => {
      if (fetchingRef.current) return;
      fetchingRef.current = true;
      if (reset) setLoading(true);
      setError(false);
      try {
        const token = getAccessToken();
        const res = await fetch(`/api/v1/discovery?${buildQuery(targetFilters, targetCursor)}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        });
        if (!res.ok) throw new Error("discovery fetch failed");
        const body = (await res.json()) as CursorPage<EventCardData>;
        setItems((prev) => (reset ? body.items : [...prev, ...body.items]));
        setCursor(body.nextCursor);
        setHasMore(body.hasMore);
      } catch {
        setError(true);
      } finally {
        setLoading(false);
        fetchingRef.current = false;
      }
    },
    [],
  );

  // Wait for the silent-refresh attempt so the first fetch already carries
  // an access token when the visitor turns out to be logged in — otherwise
  // it'd briefly (and pointlessly) fetch as anonymous, then refetch. Deferred
  // via queueMicrotask so fetchPage's own (synchronous, pre-await) loading/error
  // setState calls don't run inside this effect's own synchronous body.
  useEffect(() => {
    if (authLoading) return;
    queueMicrotask(() => void fetchPage(filters, null, true));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once auth resolves; filter changes are applied explicitly via applyFilters()
  }, [authLoading]);

  /** Swaps in a new filter set — called directly from the filter panel's "Apply" click, not reactively. */
  function applyFilters(next: DiscoveryFilters) {
    setFilters(next);
    setIndex(0);
    void fetchPage(next, null, true);
  }

  // Seed the star state from the server once logged in, so a previously
  // saved event that resurfaces in the feed already shows as saved.
  useEffect(() => {
    if (!user) return;
    const token = getAccessToken();
    if (!token) return;
    (async () => {
      const res = await fetch("/api/v1/discovery/saved", { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) return;
      const body = (await res.json()) as CursorPage<EventCardData>;
      setSavedIds(new Set(body.items.map((e) => e.id)));
    })().catch(() => {
      // Non-critical — the star just won't pre-fill for already-saved events.
    });
  }, [user]);

  const current = items[index];

  async function recordInteraction(eventId: string, interaction: "PASS" | "OPEN") {
    const token = getAccessToken();
    if (!token) return;
    await fetch(`/api/v1/discovery/${eventId}/interactions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ interaction }),
    }).catch(() => {
      // Best-effort — a failed interaction log shouldn't block browsing.
    });
  }

  function handlePass() {
    if (!current) return;
    void recordInteraction(current.id, "PASS");
    const nextIndex = index + 1;
    setIndex(nextIndex);
    // Prefetch the next page directly from this click, once the queue is
    // running low — not from a reactive effect (data fetching triggered by
    // a specific user action belongs in the handler, not a useEffect).
    if (hasMore && cursor && nextIndex >= items.length - 2) {
      void fetchPage(filters, cursor, false);
    }
  }

  function handleUndo() {
    setIndex((i) => Math.max(0, i - 1));
  }

  function handleOpen() {
    if (!current) return;
    void recordInteraction(current.id, "OPEN");
    router.push(`/events/${current.slug}`);
  }

  async function handleSave() {
    if (!current) return;
    if (!user) {
      router.push("/login");
      return;
    }
    const token = getAccessToken();
    if (!token) return;
    const alreadySaved = savedIds.has(current.id);
    const eventId = current.id;
    setSavedIds((prev) => {
      const next = new Set(prev);
      if (alreadySaved) next.delete(eventId);
      else next.add(eventId);
      return next;
    });
    await fetch(`/api/v1/discovery/${eventId}/save`, {
      method: alreadySaved ? "DELETE" : "POST",
      headers: { Authorization: `Bearer ${token}` },
    }).catch(() => {
      // Revert optimistic update on failure.
      setSavedIds((prev) => {
        const next = new Set(prev);
        if (alreadySaved) next.add(eventId);
        else next.delete(eventId);
        return next;
      });
    });
  }

  return (
    <div className="mx-auto flex max-w-md flex-col gap-4 px-4 py-6">
      <div className="relative flex items-center justify-between">
        <h1 className="text-lg font-bold accent-gradient-text">{t("nav.discover")}</h1>
        <Button variant="secondary" onClick={() => setFiltersOpen((o) => !o)}>
          {t("discover.filters")}
        </Button>
        {filtersOpen && (
          <DiscoverFilters filters={filters} onApply={applyFilters} onClose={() => setFiltersOpen(false)} />
        )}
      </div>

      {loading && items.length === 0 && (
        <div className="flex aspect-[3/4] w-full items-center justify-center rounded-2xl bg-surface text-muted">
          {t("discover.loading")}
        </div>
      )}

      {error && items.length === 0 && (
        <div className="flex flex-col items-center gap-3 rounded-2xl bg-surface p-10 text-center text-muted">
          <p>{t("discover.errorLoading")}</p>
          <Button variant="secondary" onClick={() => void fetchPage(filters, null, true)}>
            {t("common.retry")}
          </Button>
        </div>
      )}

      {!loading && !error && !current && (
        <div className="flex aspect-[3/4] w-full items-center justify-center rounded-2xl bg-surface p-10 text-center text-muted">
          {t("discover.empty")}
        </div>
      )}

      {current && (
        <button type="button" onClick={handleOpen} className="text-left" aria-label={t("discover.open")}>
          <EventCard event={current} locale={locale} t={t} />
        </button>
      )}

      {!loading && !error && items.length > 0 && (
        <div className="grid grid-cols-4 gap-2">
          <button
            type="button"
            onClick={handleUndo}
            disabled={index === 0}
            title={t("discover.undo")}
            className="flex h-14 items-center justify-center rounded-full border border-border text-xl hover:bg-surface disabled:cursor-not-allowed disabled:opacity-40"
          >
            ↩️
          </button>
          <button
            type="button"
            onClick={handlePass}
            disabled={!current}
            title={t("discover.pass")}
            className="flex h-14 items-center justify-center rounded-full border border-border text-xl hover:bg-surface disabled:cursor-not-allowed disabled:opacity-40"
          >
            ✖️
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={!current}
            title={user ? t("discover.save") : t("discover.signInToSave")}
            className={`flex h-14 items-center justify-center rounded-full border text-xl hover:bg-surface disabled:cursor-not-allowed disabled:opacity-40 ${
              current && savedIds.has(current.id) ? "border-transparent accent-gradient text-white" : "border-border"
            }`}
          >
            ⭐
          </button>
          <button
            type="button"
            onClick={handleOpen}
            disabled={!current}
            title={t("discover.open")}
            className="flex h-14 items-center justify-center rounded-full border border-border text-xl hover:bg-surface disabled:cursor-not-allowed disabled:opacity-40"
          >
            ➡️
          </button>
        </div>
      )}
    </div>
  );
}
