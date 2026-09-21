"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useTranslations } from "@/lib/locale-context";
import { api } from "@/lib/api-client";
import type { EventDetail } from "@/lib/event-types";
import { EventWizard } from "@/components/event-wizard/event-wizard";
import { Button } from "@/components/ui/button";

export default function EditEventPage() {
  const { id } = useParams<{ id: string }>();
  const { user, isLoading: authLoading } = useAuth();
  const { t } = useTranslations();
  const router = useRouter();

  const [event, setEvent] = useState<EventDetail | null>(null);
  const [error, setError] = useState<"not_found" | "unknown" | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace(`/login?next=/organizer/events/${id}/edit`);
      return;
    }

    let cancelled = false;
    (async () => {
      const res = await api.GET("/api/v1/events/{id}", { params: { path: { id } } });
      if (cancelled) return;
      if (res.error) {
        setError("unknown");
        return;
      }
      if (!res.data) {
        setError("not_found");
        return;
      }
      setEvent(res.data as EventDetail);
    })();
    return () => {
      cancelled = true;
    };
  }, [authLoading, user, id, router]);

  if (authLoading || (!user && !error)) return null;

  if (error) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <p className="mb-4 text-danger">{t("common.somethingWentWrong")}</p>
        <Button variant="secondary" onClick={() => router.push("/organizer/events")}>
          {t("common.back")}
        </Button>
      </div>
    );
  }

  if (!event) {
    return <div className="mx-auto max-w-2xl px-4 py-10 text-muted">{t("common.loading")}</div>;
  }

  return <EventWizard initialEvent={event} />;
}
