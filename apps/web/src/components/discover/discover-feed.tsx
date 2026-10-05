"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  IoArrowForward,
  IoArrowUndo,
  IoClose,
  IoHeart,
  IoHeartOutline,
  IoOptionsOutline,
  IoRefresh,
  IoShareSocialOutline,
  IoSparkles,
} from "react-icons/io5";
import { useAuth } from "@/lib/auth-context";
import { useTranslations } from "@/lib/locale-context";
import { getAccessToken } from "@/lib/api-client";
import type { CursorPage, EventCard as EventCardData } from "@/lib/event-types";
import { Button } from "@/components/ui/button";
import { EventCard } from "./event-card";
import { DiscoverFilters, type DiscoveryFilters } from "./discover-filters";
import { track } from "@/lib/analytics";
import { EMPTY_FILTERS, countActiveFilters, filtersToQuery } from "@kiro/types";

const FILTERS_STORAGE_KEY = "kiro_discover_filters";
const SWIPE_DISTANCE = 100;
const TAP_DISTANCE = 6;

/** Action circles over the card: surface fill, hairline border, coloured icon — as in the app. */
const roundButton =
  "flex items-center justify-center rounded-full border border-border bg-surface shadow-lg transition active:scale-90 hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-40";
/** Dark translucent circles for the icons floating over the card's top edge. */
const overlayButton =
  "flex h-[42px] w-[42px] items-center justify-center rounded-full bg-black/45 text-white backdrop-blur transition active:scale-90 hover:bg-black/60 disabled:opacity-40";
const ACTIONS_INSET = 96;

/**
 * UX §3-8 — the Tinder-style discovery feed. Swipe left = pass, swipe right
 * (or tap) = open; the icon buttons below (undo / pass / save / open) and the
 * side arrows on wide screens do the same for mouse and keyboard users.
 */
export function DiscoverFeed() {
  const { t, locale } = useTranslations();
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();

  const [filters, setFilters] = useState<DiscoveryFilters>(EMPTY_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const [items, setItems] = useState<EventCardData[]>([]);
  const [index, setIndex] = useState(0);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const fetchingRef = useRef(false);

  const [drag, setDrag] = useState({ x: 0, y: 0, active: false });
  const [flyOut, setFlyOut] = useState<null | "left" | "right">(null);
  const startRef = useRef<{ x: number; y: number } | null>(null);

  const fetchPage = useCallback(
    async (
      targetFilters: DiscoveryFilters,
      targetCursor: string | null,
      reset: boolean,
    ) => {
      if (fetchingRef.current) return;
      fetchingRef.current = true;
      if (reset) setLoading(true);
      setError(false);
      try {
        const token = getAccessToken();
        const res = await fetch(
          `/api/v1/discovery?${filtersToQuery(targetFilters, targetCursor)}`,
          {
            headers: token ? { Authorization: `Bearer ${token}` } : undefined,
          },
        );
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
    // Restore the last-used filters (saved on this device; also mirrored to the profile on apply — §7).
    let initial = filters;
    try {
      const raw = window.localStorage.getItem(FILTERS_STORAGE_KEY);
      if (raw)
        initial = {
          ...EMPTY_FILTERS,
          ...(JSON.parse(raw) as Partial<DiscoveryFilters>),
        };
    } catch {
      // Storage blocked or corrupt — fall back to no filters.
    }
    queueMicrotask(() => {
      setFilters(initial);
      void fetchPage(initial, null, true);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once auth resolves; filter changes are applied explicitly via applyFilters()
  }, [authLoading]);

  /** Swaps in a new filter set — called directly from the filter panel's "Apply" click, not reactively. */
  function applyFilters(next: DiscoveryFilters) {
    setFilters(next);
    try {
      window.localStorage.setItem(FILTERS_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Non-critical.
    }
    const token = getAccessToken();
    if (token) {
      // Mirror the filters that map onto profile preferences so they follow the user across devices (§7).
      void fetch("/api/v1/discovery/preferences", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          preferredCityId: next.cityId,
          preferredDistrictIds: next.districtIds,
          preferredCategoryIds: next.categoryIds,
          preferredFormat: next.format === "any" ? null : next.format,
          freeOnly: next.freeOnly,
          maxBudget:
            next.maxPrice !== null && next.maxPrice < 2000
              ? next.maxPrice
              : null,
        }),
      }).catch(() => {});
    }
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
      const res = await fetch("/api/v1/discovery/saved", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const body = (await res.json()) as CursorPage<EventCardData>;
      setSavedIds(new Set(body.items.map((e) => e.id)));
    })().catch(() => {
      // Non-critical — the heart just won't pre-fill for already-saved events.
    });
  }, [user]);

  /** End-of-feed "Look again": forget the skipped events server-side, then reload the feed from the top. */
  async function seeAgain() {
    setRestarting(true);
    try {
      const token = getAccessToken();
      if (token) {
        await fetch("/api/v1/discovery/passes", {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        }).catch(() => {});
      }
      // The card index stays parked past the end of the old list — without resetting it the reloaded events
      // were fetched but never shown, so "Look again" appeared to do nothing.
      setIndex(0);
      await fetchPage(filters, null, true);
    } finally {
      setRestarting(false);
    }
  }

  const current = items[index];
  // §35 — one impression per card shown.
  const lastImpression = useRef<string | null>(null);
  useEffect(() => {
    if (current && lastImpression.current !== current.id) {
      lastImpression.current = current.id;
      track(current.id, "IMPRESSION");
    }
  }, [current]);
  const upcoming = items[index + 1];
  const activeFilterCount = countActiveFilters(filters);

  async function recordInteraction(
    eventId: string,
    interaction: "PASS" | "OPEN",
  ) {
    const token = getAccessToken();
    if (!token) return;
    await fetch(`/api/v1/discovery/${eventId}/interactions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
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
    // Prefetch the next page directly from this action, once the queue is
    // running low — not from a reactive effect (data fetching triggered by
    // a specific user action belongs in the handler, not a useEffect).
    if (hasMore && cursor && nextIndex >= items.length - 2) {
      void fetchPage(filters, cursor, false);
    }
  }

  const [shareNote, setShareNote] = useState<string | null>(null);

  /** §11/§65 — native share sheet where available, otherwise copy the public link. */
  async function handleShare() {
    if (!current) return;
    const url = `${window.location.origin}/events/${current.slug}`;
    try {
      if (navigator.share) {
        track(current.id, "SHARE");
        await navigator.share({ title: current.title, url });
        return;
      }
      track(current.id, "SHARE");
      await navigator.clipboard.writeText(url);
      setShareNote(t("profile.linkCopied"));
      window.setTimeout(() => setShareNote(null), 2000);
    } catch {
      // User cancelled the share sheet or clipboard is blocked — nothing to do.
    }
  }

  function handleUndo() {
    setIndex((i) => Math.max(0, i - 1));
  }

  function handleOpen() {
    if (!current) return;
    void recordInteraction(current.id, "OPEN");
    router.push(`/events/${current.slug}?src=swipe`);
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

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (flyOut) return;
    startRef.current = { x: e.clientX, y: e.clientY };
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag({ x: 0, y: 0, active: true });
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const start = startRef.current;
    if (!start) return;
    setDrag({
      x: e.clientX - start.x,
      y: (e.clientY - start.y) * 0.3,
      active: true,
    });
  }

  function onPointerUp() {
    const start = startRef.current;
    startRef.current = null;
    if (!start) return;
    const { x, y } = drag;
    if (Math.abs(x) < TAP_DISTANCE && Math.abs(y) < TAP_DISTANCE) {
      setDrag({ x: 0, y: 0, active: false });
      handleOpen();
      return;
    }
    if (Math.abs(x) >= SWIPE_DISTANCE) {
      const direction = x > 0 ? "right" : "left";
      setFlyOut(direction);
      setDrag({ x: x > 0 ? 700 : -700, y, active: false });
      window.setTimeout(() => {
        setFlyOut(null);
        setDrag({ x: 0, y: 0, active: false });
        if (direction === "right") handleOpen();
        else handlePass();
      }, 220);
      return;
    }
    setDrag({ x: 0, y: 0, active: false });
  }

  const passOpacity = Math.min(1, Math.max(0, -drag.x / SWIPE_DISTANCE));
  const openOpacity = Math.min(1, Math.max(0, drag.x / SWIPE_DISTANCE));
  const hasCards = !loading && !error && items.length > 0;

  return (
    <div className="mx-auto w-full max-w-[460px] sm:px-4 sm:py-5">
      <h1 className="sr-only">{t("nav.discover")}</h1>

      {/* The deck fills the screen between the header and the tab bar on a phone (like the app); on a larger screen it is a tall centred card. */}
      <div className="relative h-[calc(100dvh-7.5rem)] min-h-[440px] sm:h-[min(calc(100dvh-8rem),760px)]">
        {loading && items.length === 0 && (
          <div className="h-full w-full animate-pulse bg-surface sm:rounded-[28px]" aria-label={t("discover.loading")} />
        )}

        {error && items.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center gap-3 bg-surface p-10 text-center text-muted sm:rounded-[28px]">
            <p>{t("discover.errorLoading")}</p>
            <Button variant="secondary" onClick={() => void fetchPage(filters, null, true)}>
              {t("common.retry")}
            </Button>
          </div>
        )}

        {!loading && !error && !current && (
          <div className="flex h-full flex-col items-center justify-center gap-4 bg-surface p-10 text-center sm:rounded-[28px]">
            <span className="flex h-20 w-20 items-center justify-center rounded-full bg-[var(--accent-from)]/10 text-[var(--accent-from)]">
              <IoSparkles className="h-10 w-10" aria-hidden="true" />
            </span>
            <h2 className="text-[22px] font-extrabold text-foreground">{t("discover.endTitle")}</h2>
            <p className="max-w-xs text-sm text-muted">{t("discover.endText")}</p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button onClick={() => void seeAgain()} loading={restarting}>
                <IoRefresh className="h-[18px] w-[18px]" aria-hidden="true" /> {t("discover.seeAgain")}
              </Button>
              <Button variant="secondary" onClick={() => setFiltersOpen(true)}>
                <IoOptionsOutline className="h-[18px] w-[18px]" aria-hidden="true" /> {t("discover.changeFilters")}
              </Button>
            </div>
            {index > 0 && (
              <button type="button" onClick={handleUndo} className="inline-flex items-center gap-1 text-sm text-muted hover:underline">
                <IoArrowUndo className="h-4 w-4" aria-hidden="true" /> {t("discover.undo")}
              </button>
            )}
          </div>
        )}

        {current && (
          <>
            {upcoming && (
              <div className="pointer-events-none absolute inset-0 origin-bottom scale-[0.96] opacity-70" aria-hidden="true">
                <EventCard event={upcoming} locale={locale} t={t} bottomInset={ACTIONS_INSET} />
              </div>
            )}

            <div
              role="button"
              tabIndex={0}
              aria-label={t("discover.open")}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleOpen();
                if (e.key === "ArrowLeft") handlePass();
                if (e.key === "ArrowRight") handleOpen();
              }}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={() => {
                startRef.current = null;
                setDrag({ x: 0, y: 0, active: false });
              }}
              className="absolute inset-0 cursor-grab touch-pan-y select-none active:cursor-grabbing"
              style={{
                transform: `translate(${drag.x}px, ${drag.y}px) rotate(${drag.x / 25}deg)`,
                transition: drag.active ? "none" : "transform 220ms ease-out",
              }}
            >
              <EventCard event={current} locale={locale} t={t} bottomInset={ACTIONS_INSET} />
              <span
                className="pointer-events-none absolute left-5 top-24 rotate-[-12deg] rounded-[10px] border-4 border-rose-500 px-3 py-1 text-2xl font-extrabold uppercase text-rose-500"
                style={{ opacity: passOpacity }}
              >
                {t("discover.pass")}
              </span>
              <span
                className="pointer-events-none absolute right-5 top-24 rotate-[12deg] rounded-[10px] border-4 border-emerald-400 px-3 py-1 text-2xl font-extrabold uppercase text-emerald-400"
                style={{ opacity: openOpacity }}
              >
                {t("discover.open")}
              </span>
            </div>
          </>
        )}

        {/* Share and filters float over the card's top edge, as in the app. */}
        <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-end gap-2 p-4">
          <button
            type="button"
            onClick={() => void handleShare()}
            disabled={!current}
            aria-label={t("discover.share")}
            title={t("discover.share")}
            className={overlayButton}
          >
            <IoShareSocialOutline className="h-[22px] w-[22px]" />
          </button>
          <button
            type="button"
            onClick={() => setFiltersOpen((o) => !o)}
            aria-label={t("discover.filters")}
            title={t("discover.filters")}
            className={`relative ${overlayButton}`}
          >
            <IoOptionsOutline className="h-[22px] w-[22px]" />
            {activeFilterCount > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[var(--accent-to)] px-1 text-[11px] font-extrabold text-white">
                {activeFilterCount}
              </span>
            )}
          </button>
          {shareNote && (
            <span
              role="status"
              className="absolute right-4 top-full mt-1 rounded-full bg-foreground px-3 py-1 text-xs font-semibold text-background"
            >
              {shareNote}
            </span>
          )}
        </div>
        {filtersOpen && (
          <DiscoverFilters filters={filters} onApply={applyFilters} onClose={() => setFiltersOpen(false)} />
        )}

        {hasCards && (
          <div className="absolute inset-x-0 bottom-5 z-10 flex items-center justify-center gap-4">
            <button
              type="button"
              onClick={handleUndo}
              disabled={index === 0}
              title={t("discover.undo")}
              aria-label={t("discover.undo")}
              className={`h-12 w-12 text-amber-500 ${roundButton}`}
            >
              <IoArrowUndo className="h-6 w-6" />
            </button>
            <button
              type="button"
              onClick={handlePass}
              disabled={!current}
              title={t("discover.pass")}
              aria-label={t("discover.pass")}
              className={`h-16 w-16 text-rose-500 ${roundButton}`}
            >
              <IoClose className="h-8 w-8" />
            </button>
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={!current}
              title={user ? t("discover.save") : t("discover.signInToSave")}
              aria-label={t("discover.save")}
              className={`h-16 w-16 ${roundButton} ${
                current && savedIds.has(current.id)
                  ? "!border-[var(--accent-to)] !bg-[var(--accent-to)] text-white"
                  : "text-[#ec4899]"
              }`}
            >
              {current && savedIds.has(current.id) ? <IoHeart className="h-8 w-8" /> : <IoHeartOutline className="h-8 w-8" />}
            </button>
            <button
              type="button"
              onClick={handleOpen}
              disabled={!current}
              title={t("discover.open")}
              aria-label={t("discover.open")}
              className={`h-12 w-12 text-emerald-400 ${roundButton}`}
            >
              <IoArrowForward className="h-6 w-6" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
