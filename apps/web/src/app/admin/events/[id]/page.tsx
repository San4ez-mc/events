"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useTranslations } from "@/lib/locale-context";
import { getAccessToken } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/text-field";

interface AdminEventDetail {
  id: string;
  slug: string;
  title: string;
  status: string;
  owner: { name: string | null; nickname: string | null; email: string };
}

export default function AdminEventDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslations();
  const [event, setEvent] = useState<AdminEventDetail | null>(null);
  const [title, setTitle] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const token = getAccessToken();
    if (!token) return;
    const res = await fetch(`/api/v1/admin/events/${id}`, { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) {
      const body = (await res.json()) as AdminEventDetail;
      setEvent(body);
      setTitle(body.title);
    }
  }, [id]);

  useEffect(() => {
    queueMicrotask(() => void load());
  }, [load]);

  async function saveTitle() {
    const token = getAccessToken();
    if (!token) return;
    setBusy(true);
    try {
      await fetch(`/api/v1/admin/events/${id}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function cancelEvent() {
    const token = getAccessToken();
    if (!token) return;
    setBusy(true);
    try {
      await fetch(`/api/v1/admin/events/${id}/cancel`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reason.trim() || undefined }),
      });
      await load();
    } finally {
      setBusy(false);
    }
  }

  if (event === null) return <div className="mx-auto max-w-2xl px-4 py-10 text-muted">{t("common.loading")}</div>;

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">{event.title}</h1>
        <Link href={`/events/${event.slug}`} target="_blank" className="text-sm text-muted underline">
          {event.slug}
        </Link>
      </div>
      <p className="mb-6 text-sm text-muted">
        {event.status} · {event.owner.name ?? event.owner.nickname ?? event.owner.email}
      </p>

      <section className="mb-6 rounded-lg border border-border p-4">
        <div className="mb-3">
          <TextField label={t("admin.events.editTitle")} value={title} onChange={setTitle} />
        </div>
        <Button disabled={!title.trim() || title === event.title} loading={busy} onClick={() => void saveTitle()}>
          {t("common.save")}
        </Button>
      </section>

      {event.status !== "CANCELLED" && (
        <section className="rounded-lg border border-border p-4">
          <div className="mb-3">
            <TextField label={t("admin.events.cancelReason")} value={reason} onChange={setReason} />
          </div>
          <Button variant="secondary" loading={busy} onClick={() => void cancelEvent()}>
            {t("admin.events.cancel")}
          </Button>
        </section>
      )}
    </div>
  );
}
