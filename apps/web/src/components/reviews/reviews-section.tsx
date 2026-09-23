"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useTranslations } from "@/lib/locale-context";
import { getAccessToken } from "@/lib/api-client";
import type { EventReview } from "@/lib/event-types";
import { Button } from "@/components/ui/button";

/** §37/§38/§81 — an event's rating summary + published reviews + (if eligible) the leave-a-review form. */
export function ReviewsSection({
  eventId,
  eventStatus,
  reviewSummary,
}: {
  eventId: string;
  eventStatus: string;
  reviewSummary: { average: number | null; count: number };
}) {
  const { user, isLoading: authLoading } = useAuth();
  const { t, locale } = useTranslations();

  const [reviews, setReviews] = useState<EventReview[] | null>(null);
  const [rating, setRating] = useState(0);
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/v1/events/${eventId}/reviews`);
    if (!res.ok) return;
    const body = (await res.json()) as { items: EventReview[] };
    setReviews(body.items);
  }, [eventId]);

  useEffect(() => {
    // Deferred so `load`'s setState calls don't execute synchronously within this effect's body.
    queueMicrotask(() => void load());
  }, [load]);

  const myReview = user ? (reviews?.find((r) => r.authorUserId === user.id) ?? null) : null;

  async function submit() {
    const token = getAccessToken();
    if (!token || rating < 1) return;
    setSubmitting(true);
    setError(false);
    try {
      const res = await fetch(`/api/v1/events/${eventId}/reviews`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ rating, text: text.trim() || undefined }),
      });
      if (!res.ok) {
        setError(true);
        return;
      }
      setRating(0);
      setText("");
      await load();
    } finally {
      setSubmitting(false);
    }
  }

  async function remove(reviewId: string) {
    const token = getAccessToken();
    if (!token) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/v1/reviews/${reviewId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) await load();
    } finally {
      setSubmitting(false);
    }
  }

  const canReview = eventStatus === "COMPLETED" && !authLoading && user;

  return (
    <section className="mb-8">
      <h2 className="mb-3 text-sm font-semibold">{t("reviews.title")}</h2>

      <div className="mb-4 flex items-center gap-2 text-sm">
        {reviewSummary.average != null ? (
          <>
            <span className="text-lg">⭐ {reviewSummary.average.toFixed(1)}</span>
            <span className="text-muted">
              ({reviewSummary.count} {reviewSummary.count === 1 ? t("profile.reviewsCountOne") : t("profile.reviewsCountMany")})
            </span>
          </>
        ) : (
          <span className="text-muted">{t("reviews.noRating")}</span>
        )}
      </div>

      {canReview && !myReview && (
        <div className="mb-6 rounded-lg border border-border p-4">
          <p className="mb-2 text-sm font-medium">{t("reviews.leaveReview")}</p>
          <StarPicker value={rating} onChange={setRating} />
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={t("reviews.textLabel")}
            className="mt-3 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            rows={3}
          />
          {error && <p className="mt-2 text-xs text-danger">{t("reviews.submitError")}</p>}
          <Button className="mt-3" disabled={rating < 1} loading={submitting} onClick={() => void submit()}>
            {t("reviews.submit")}
          </Button>
        </div>
      )}

      {myReview && (
        <div className="mb-6 rounded-lg border border-border p-4">
          <p className="mb-1 text-xs font-medium text-muted">{t("reviews.yourReview")}</p>
          <p className="mb-2 text-sm">⭐ {myReview.rating}</p>
          {myReview.text && <p className="mb-3 text-sm">{myReview.text}</p>}
          <Button variant="secondary" loading={submitting} onClick={() => void remove(myReview.id)}>
            {t("reviews.delete")}
          </Button>
        </div>
      )}

      {reviews !== null && reviews.length === 0 && <p className="text-sm text-muted">{t("reviews.empty")}</p>}

      {reviews !== null && reviews.length > 0 && (
        <ul className="flex flex-col gap-3">
          {reviews
            .filter((r) => r.id !== myReview?.id)
            .map((review) => (
              <li key={review.id} className="rounded-lg border border-border p-3 text-sm">
                <div className="mb-1 flex items-center justify-between">
                  <span className="font-medium">{review.author.name ?? review.author.nickname ?? "—"}</span>
                  <span>⭐ {review.rating}</span>
                </div>
                {review.text && <p className="text-muted">{review.text}</p>}
                <p className="mt-1 text-xs text-muted">
                  {new Date(review.createdAt).toLocaleDateString(locale === "uk" ? "uk-UA" : "en-US")}
                </p>
              </li>
            ))}
        </ul>
      )}
    </section>
  );
}

function StarPicker({ value, onChange }: { value: number; onChange: (rating: number) => void }) {
  return (
    <div className="flex gap-1" role="radiogroup" aria-label="Rating">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          role="radio"
          aria-checked={value === star}
          onClick={() => onChange(star)}
          className="text-2xl leading-none"
        >
          {star <= value ? "⭐" : "☆"}
        </button>
      ))}
    </div>
  );
}
