"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useTranslations } from "@/lib/locale-context";
import { getAccessToken } from "@/lib/api-client";
import type { CursorPage, EventCard } from "@/lib/event-types";
import { EventResultRow } from "@/components/search/event-result-row";
import { Button } from "@/components/ui/button";

/** UX §5 — "Мої → Збережені". */
export function SavedEventsContent() {
  const { t, locale } = useTranslations();
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const [items, setItems] = useState<EventCard[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace("/login");
      return;
    }
    void loadSaved(null, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-run when auth resolves
  }, [authLoading, user]);

  async function loadSaved(pageCursor: string | null, reset: boolean) {
    const token = getAccessToken();
    if (!token) return;
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (pageCursor) params.set("cursor", pageCursor);
      const res = await fetch(`/api/v1/discovery/saved?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const body = (await res.json()) as CursorPage<EventCard>;
      setItems((prev) => (reset ? body.items : [...prev, ...body.items]));
      setCursor(body.nextCursor);
      setHasMore(body.hasMore);
    } finally {
      setLoading(false);
    }
  }

  if (authLoading || !user) return null;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-8">
      <h1 className="text-lg font-bold accent-gradient-text">{t("discover.savedTitle")}</h1>

      {loading && items.length === 0 && <p className="text-center text-muted">{t("common.loading")}</p>}
      {!loading && items.length === 0 && <p className="text-center text-muted">{t("discover.savedEmpty")}</p>}

      <div className="flex flex-col gap-2">
        {items.map((event) => (
          <EventResultRow key={event.id} event={event} locale={locale} t={t} />
        ))}
      </div>

      {hasMore && (
        <Button variant="secondary" loading={loading} onClick={() => void loadSaved(cursor, false)}>
          {t("search.loadMore")}
        </Button>
      )}
    </div>
  );
}
