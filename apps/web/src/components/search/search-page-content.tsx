"use client";

import { captureEvent } from "@/lib/product-analytics";
import { useEffect, useRef, useState } from "react";
import { EMPTY_FILTERS, countActiveFilters, filtersToQuery } from "@kiro/types";
import { useTranslations } from "@/lib/locale-context";
import type { CursorPage, EventCard } from "@/lib/event-types";
import { TextField } from "@/components/ui/text-field";
import { Button } from "@/components/ui/button";
import { EmptyState, ScreenHeader } from "@/components/ui/screen-header";
import { IoOptionsOutline, IoSadOutline, IoSearch, IoSparkles } from "react-icons/io5";
import { DiscoverFilters, type DiscoveryFilters } from "@/components/discover/discover-filters";
import { EventResultRow } from "./event-result-row";
import { CityAlertForm } from "@/components/city-alert-form";

/** Same key the feed saves its filters under: the city picked there is already selected here. */
const FILTERS_STORAGE_KEY = "kiro_discover_filters";

/** UX §9/§63 — search is public, list-style, no auth required. Filters (city, day, price…) sit next to the box, like in the feed. */
export function SearchPageContent() {
  const { t, locale } = useTranslations();
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<DiscoveryFilters>(EMPTY_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [items, setItems] = useState<EventCard[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  // The query + filters a completed search's `items` actually belong to — lets the
  // empty-query "prompt" state and the empty-results "nothing found" state
  // be derived below instead of imperatively cleared when the box empties.
  const [resultsFor, setResultsFor] = useState<string | null>(null);
  // What to show instead of a dead end when a search finds nothing: the next events in the feed.
  const [suggestions, setSuggestions] = useState<EventCard[] | null>(null);
  const requestId = useRef(0);

  const trimmedQuery = query.trim();
  const activeCount = countActiveFilters(filters);
  const filtersKey = JSON.stringify(filters);
  const currentKey = `${trimmedQuery}|${filtersKey}`;
  const hasInput = trimmedQuery !== "" || activeCount > 0;

  // Start from the filters the feed already remembers on this device.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(FILTERS_STORAGE_KEY);
      // Deferred: the setState must not run inside this effect's own synchronous body.
      if (raw) queueMicrotask(() => setFilters({ ...EMPTY_FILTERS, ...(JSON.parse(raw) as Partial<DiscoveryFilters>) }));
    } catch {
      // Storage blocked or corrupt — start unfiltered.
    }
  }, []);

  useEffect(() => {
    if (!hasInput) return;
    // The setTimeout callback runs asynchronously, after this effect's own
    // synchronous body has finished — not a direct setState-in-effect call.
    const timer = setTimeout(() => void runSearch(trimmedQuery, filters, null, true), 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `currentKey` already covers query + filters
  }, [currentKey]);

  async function runSearch(q: string, f: DiscoveryFilters, searchCursor: string | null, reset: boolean) {
    const id = ++requestId.current;
    setLoading(true);
    try {
      // With text: a search narrowed by the filters. Filters alone: a filtered browse of the feed.
      const filterQuery = filtersToQuery(f, searchCursor);
      const url = q ? `/api/v1/search?q=${encodeURIComponent(q)}${filterQuery ? `&${filterQuery}` : ""}` : `/api/v1/discovery?limit=20${filterQuery ? `&${filterQuery}` : ""}`;
      const res = await fetch(url);
      const body = (await res.json()) as CursorPage<EventCard>;
      if (id !== requestId.current) return; // a newer keystroke/filter change superseded this request
      setItems((prev) => (reset ? body.items : [...prev, ...body.items]));
      setCursor(body.nextCursor);
      setHasMore(body.hasMore);
      setResultsFor(`${q}|${JSON.stringify(f)}`);
      if (reset && q) captureEvent("search", { query: q.toLowerCase().slice(0, 80), results_count: body.items.length, filters: countActiveFilters(f) });
      if (reset && body.items.length === 0 && suggestions === null) {
        const feed = await fetch("/api/v1/discovery?limit=5").catch(() => null);
        if (feed?.ok) setSuggestions(((await feed.json()) as CursorPage<EventCard>).items);
      }
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }

  const searched = resultsFor === currentKey && hasInput;
  const displayedItems = searched ? items : [];

  const quickChips = [
    { key: "today", label: t("filters.dateToday"), on: filters.datePreset === "today", next: { ...filters, datePreset: filters.datePreset === "today" ? ("any" as const) : ("today" as const), dateFrom: "", dateTo: "" } },
    { key: "tomorrow", label: t("filters.dateTomorrow"), on: filters.datePreset === "tomorrow", next: { ...filters, datePreset: filters.datePreset === "tomorrow" ? ("any" as const) : ("tomorrow" as const), dateFrom: "", dateTo: "" } },
    { key: "weekend", label: t("filters.dateWeekend"), on: filters.datePreset === "weekend", next: { ...filters, datePreset: filters.datePreset === "weekend" ? ("any" as const) : ("weekend" as const), dateFrom: "", dateTo: "" } },
    { key: "free", label: t("common.free"), on: filters.freeOnly, next: { ...filters, freeOnly: !filters.freeOnly } },
  ];
  const chipClass = (on: boolean) =>
    `inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 py-2 text-[13px] font-bold ${on ? "accent-gradient border-transparent text-white" : "border-border text-foreground"}`;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-6 pb-24 sm:py-10">
      <ScreenHeader title={t("nav.search")} subtitle={t("screens.searchSubtitle")} Icon={IoSearch} />
      <TextField
        label={t("nav.search")}
        value={query}
        onChange={setQuery}
        placeholder={t("search.placeholder")}
      />

      <div className="flex flex-wrap gap-2" role="group" aria-label={t("discover.filters")}>
        <button type="button" onClick={() => setFiltersOpen(true)} className={chipClass(activeCount > 0)}>
          <IoOptionsOutline className="h-4 w-4" aria-hidden="true" />
          {activeCount > 0 ? `${t("discover.filters")} · ${activeCount}` : t("discover.filters")}
        </button>
        {quickChips.map((c) => (
          <button key={c.key} type="button" aria-pressed={c.on} onClick={() => setFilters(c.next)} className={chipClass(c.on)}>
            {c.label}
          </button>
        ))}
        {activeCount > 0 && (
          <button type="button" onClick={() => setFilters(EMPTY_FILTERS)} className={chipClass(false)}>
            {t("search.clearFilters")}
          </button>
        )}
      </div>

      {filtersOpen && (
        <DiscoverFilters
          filters={filters}
          onApply={(next) => {
            setFilters(next);
            setFiltersOpen(false);
          }}
          onClose={() => setFiltersOpen(false)}
        />
      )}

      {loading && displayedItems.length === 0 && <p className="text-center text-muted">{t("search.loading")}</p>}

      {!loading && !hasInput && (
        <EmptyState Icon={IoSparkles} title={t("screens.searchHintTitle")} text={t("screens.searchHintText")} />
      )}

      {!loading && searched && displayedItems.length === 0 && (
        <>
          <EmptyState Icon={IoSadOutline} text={t("screens.searchNothing")} />
          {trimmedQuery !== "" && <CityAlertForm kind="NO_EVENTS" query={trimmedQuery} showCreate />}
          {suggestions && suggestions.length > 0 && (
            <div className="flex flex-col gap-2.5">
              <p className="text-sm text-muted">{t("search.nothingTry")}</p>
              {suggestions.map((event) => (
                <EventResultRow key={event.id} event={event} locale={locale} t={t} />
              ))}
            </div>
          )}
        </>
      )}

      <div className="flex flex-col gap-2.5">
        {displayedItems.map((event) => (
          <EventResultRow key={event.id} event={event} locale={locale} t={t} />
        ))}
      </div>

      {searched && hasMore && (
        <Button variant="secondary" loading={loading} onClick={() => void runSearch(trimmedQuery, filters, cursor, false)}>
          {t("search.loadMore")}
        </Button>
      )}
    </div>
  );
}
