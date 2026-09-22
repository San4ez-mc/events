"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "@/lib/locale-context";
import type { CursorPage, EventCard } from "@/lib/event-types";
import { TextField } from "@/components/ui/text-field";
import { Button } from "@/components/ui/button";
import { EventResultRow } from "./event-result-row";

/** UX §9/§63 — search is public, list-style, no auth required. */
export function SearchPageContent() {
  const { t, locale } = useTranslations();
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<EventCard[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  // The query a completed search's `items` actually belong to — lets the
  // empty-query "prompt" state and the empty-results "nothing found" state
  // be derived below instead of imperatively cleared when the box empties.
  const [resultsForQuery, setResultsForQuery] = useState<string | null>(null);

  const trimmedQuery = query.trim();

  useEffect(() => {
    if (!trimmedQuery) return;
    // The setTimeout callback runs asynchronously, after this effect's own
    // synchronous body has finished — not a direct setState-in-effect call.
    const timer = setTimeout(() => void runSearch(trimmedQuery, null, true), 300);
    return () => clearTimeout(timer);
  }, [trimmedQuery]);

  async function runSearch(q: string, searchCursor: string | null, reset: boolean) {
    setLoading(true);
    try {
      const params = new URLSearchParams({ q });
      if (searchCursor) params.set("cursor", searchCursor);
      const res = await fetch(`/api/v1/search?${params}`);
      const body = (await res.json()) as CursorPage<EventCard>;
      setItems((prev) => (reset ? body.items : [...prev, ...body.items]));
      setCursor(body.nextCursor);
      setHasMore(body.hasMore);
      setResultsForQuery(q);
    } finally {
      setLoading(false);
    }
  }

  const searched = resultsForQuery === trimmedQuery && trimmedQuery !== "";
  const displayedItems = searched ? items : [];

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-8">
      <TextField
        label={t("nav.search")}
        value={query}
        onChange={setQuery}
        placeholder={t("search.placeholder")}
      />

      {loading && displayedItems.length === 0 && <p className="text-center text-muted">{t("search.loading")}</p>}

      {!loading && trimmedQuery === "" && <p className="text-center text-muted">{t("search.prompt")}</p>}

      {!loading && searched && displayedItems.length === 0 && (
        <p className="text-center text-muted">{t("search.empty")}</p>
      )}

      <div className="flex flex-col gap-2">
        {displayedItems.map((event) => (
          <EventResultRow key={event.id} event={event} locale={locale} t={t} />
        ))}
      </div>

      {searched && hasMore && (
        <Button variant="secondary" loading={loading} onClick={() => void runSearch(trimmedQuery, cursor, false)}>
          {t("search.loadMore")}
        </Button>
      )}
    </div>
  );
}
