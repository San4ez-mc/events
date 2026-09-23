"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "@/lib/locale-context";
import { getAccessToken } from "@/lib/api-client";
import type { AdminEventListItem, CursorPage } from "@/lib/admin-types";

const STATUSES = ["", "DRAFT", "PENDING_MODERATION", "PUBLISHED", "REJECTED", "CANCELLED", "COMPLETED", "ARCHIVED"] as const;

export default function AdminEventsPage() {
  const { t } = useTranslations();
  const [events, setEvents] = useState<AdminEventListItem[] | null>(null);
  const [status, setStatus] = useState("");

  const load = useCallback(async (statusFilter: string) => {
    const token = getAccessToken();
    if (!token) return;
    const params = statusFilter ? `?status=${statusFilter}` : "";
    const res = await fetch(`/api/v1/admin/events${params}`, { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) setEvents((await res.json() as CursorPage<AdminEventListItem>).items);
  }, []);

  useEffect(() => {
    queueMicrotask(() => void load(""));
  }, [load]);

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="mb-6 text-2xl font-bold">{t("admin.events.title")}</h1>

      <div className="mb-6 flex flex-col gap-1.5">
        <label className="text-sm font-medium">{t("admin.events.filterStatus")}</label>
        <select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            void load(e.target.value);
          }}
          className="rounded-md border border-border bg-background px-3 py-2 text-sm"
        >
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s || t("admin.events.all")}
            </option>
          ))}
        </select>
      </div>

      {events === null && <p className="text-muted">{t("common.loading")}</p>}

      {events !== null && (
        <ul className="flex flex-col gap-2">
          {events.map((event) => (
            <li key={event.id}>
              <Link
                href={`/admin/events/${event.id}`}
                className="flex items-center justify-between rounded-lg border border-border p-3 text-sm hover:bg-surface"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{event.title}</p>
                  <p className="truncate text-xs text-muted">
                    {event.owner.name ?? event.owner.nickname ?? event.owner.email}
                  </p>
                </div>
                <span className="shrink-0 text-xs text-muted">{event.status}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
