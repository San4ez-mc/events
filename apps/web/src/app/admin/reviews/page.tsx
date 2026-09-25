"use client";

import { useCallback, useEffect, useState } from "react";
import { Star } from "lucide-react";
import { useTranslations } from "@/lib/locale-context";
import { getAccessToken } from "@/lib/api-client";
import { Button } from "@/components/ui/button";

interface AdminReview {
  id: string;
  rating: number;
  text: string | null;
  status: "PUBLISHED" | "HIDDEN" | "REMOVED";
  createdAt: string;
  event: { id: string; title: string; slug: string };
  author: { id: string; name: string | null; nickname: string | null };
}

const FILTERS = ["ALL", "PUBLISHED", "HIDDEN", "REMOVED"] as const;

/** §37/§72 — moderate reviews: hide (reversible) or remove. */
export default function AdminReviewsPage() {
  const { t } = useTranslations();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("PUBLISHED");
  const [items, setItems] = useState<AdminReview[] | null>(null);
  const [error, setError] = useState(false);

  const headers = () => ({
    Authorization: `Bearer ${getAccessToken() ?? ""}`,
    "Content-Type": "application/json",
  });

  const load = useCallback(async () => {
    setError(false);
    const qs = filter === "ALL" ? "" : `?status=${filter}`;
    const res = await fetch(`/api/v1/admin/reviews${qs}`, {
      headers: headers(),
    });
    if (res.ok) setItems((await res.json()).items);
    else setError(true);
  }, [filter]);

  useEffect(() => {
    queueMicrotask(() => void load());
  }, [load]);

  async function setStatus(id: string, status: AdminReview["status"]) {
    const res = await fetch(`/api/v1/admin/reviews/${id}`, {
      method: "PATCH",
      headers: headers(),
      body: JSON.stringify({ status }),
    });
    if (!res.ok) setError(true);
    await load();
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="mb-4 text-2xl font-bold">{t("admin.reviews.title")}</h1>
      <div className="mb-6 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => {
              setItems(null);
              setFilter(f);
            }}
            className={`rounded-full px-4 py-1.5 text-sm ${filter === f ? "accent-gradient text-white" : "border border-border hover:bg-surface"}`}
          >
            {f}
          </button>
        ))}
      </div>
      {error && (
        <p className="mb-3 text-sm text-danger">
          {t("common.somethingWentWrong")}
        </p>
      )}
      {items === null && !error && (
        <p className="text-muted">{t("common.loading")}</p>
      )}
      {items?.length === 0 && <p className="text-muted">{t("common.empty")}</p>}
      <ul className="flex flex-col gap-3">
        {items?.map((r) => (
          <li
            key={r.id}
            className="rounded-2xl border border-border p-4 text-sm"
          >
            <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
              <span className="font-semibold">{r.event.title}</span>
              <span className="flex items-center gap-1 text-amber-500">
                {Array.from({ length: r.rating }).map((_, i) => (
                  <Star
                    key={i}
                    className="h-3.5 w-3.5"
                    fill="currentColor"
                    aria-hidden="true"
                  />
                ))}
              </span>
            </div>
            <p className="mb-1 text-xs text-muted">
              {r.author.name ?? r.author.nickname} ·{" "}
              {new Date(r.createdAt).toLocaleDateString()} · {r.status}
            </p>
            {r.text && <p className="mb-3 whitespace-pre-wrap">{r.text}</p>}
            <div className="flex gap-2">
              {r.status !== "PUBLISHED" && (
                <Button
                  variant="secondary"
                  onClick={() => void setStatus(r.id, "PUBLISHED")}
                >
                  {t("admin.reviews.restore")}
                </Button>
              )}
              {r.status === "PUBLISHED" && (
                <Button
                  variant="secondary"
                  onClick={() => void setStatus(r.id, "HIDDEN")}
                >
                  {t("admin.reviews.hide")}
                </Button>
              )}
              {r.status !== "REMOVED" && (
                <Button
                  variant="secondary"
                  onClick={() => void setStatus(r.id, "REMOVED")}
                >
                  {t("admin.reviews.remove")}
                </Button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
