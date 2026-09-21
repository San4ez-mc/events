"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useTranslations } from "@/lib/locale-context";
import { api } from "@/lib/api-client";
import type { EventDetail } from "@/lib/event-types";
import { EventPage } from "@/components/event-page";

/**
 * Fallback for when the server-side (unauthenticated) fetch in page.tsx
 * found nothing published at this slug — retries client-side with whatever
 * access token AuthProvider's silent refresh produces, so an organizer can
 * open their own unpublished draft's preview link (§115 Phase 1 acceptance)
 * while a stranger correctly still sees 404.
 */
export function DraftPreview({ slug }: { slug: string }) {
  const { isLoading: authLoading } = useAuth();
  const { locale, t } = useTranslations();
  const [event, setEvent] = useState<EventDetail | null | undefined>(undefined);

  useEffect(() => {
    if (authLoading) return;
    let cancelled = false;
    (async () => {
      const res = await api.GET("/api/v1/events/slug/{slug}", { params: { path: { slug } } });
      if (cancelled) return;
      setEvent(res.data ? (res.data as EventDetail) : null);
    })();
    return () => {
      cancelled = true;
    };
  }, [authLoading, slug]);

  if (authLoading || event === undefined) {
    return <div className="mx-auto max-w-2xl px-4 py-16 text-center text-muted">{t("common.loading")}</div>;
  }

  if (event === null) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <p className="text-muted">{t("errors.EVENT_NOT_FOUND")}</p>
      </div>
    );
  }

  return <EventPage event={event} locale={locale} />;
}
