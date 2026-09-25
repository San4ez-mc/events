"use client";

import { useRef, useState } from "react";
import { useTranslations } from "@/lib/locale-context";
import { getAccessToken } from "@/lib/api-client";
import type { EventMedia } from "@/lib/event-types";
import { ApiRequestError } from "@/lib/auth-context";

interface StepMediaProps {
  eventId: string;
  media: EventMedia[];
  onMediaChange: (media: EventMedia[]) => void;
}

export function StepMedia({ eventId, media, onMediaChange }: StepMediaProps) {
  const { t } = useTranslations();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setError(null);
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(`/api/v1/events/${eventId}/media`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${getAccessToken() ?? ""}`,
          "X-Client-Platform": "web",
        },
        credentials: "include",
        body: formData,
      });
      const body = await res.json();
      if (!res.ok) throw new ApiRequestError(body);
      onMediaChange([...media, body]);
    } catch (err) {
      setError(
        err instanceof ApiRequestError
          ? t(`errors.${err.code}`)
          : t("common.somethingWentWrong"),
      );
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(mediaId: string) {
    await fetch(`/api/v1/events/${eventId}/media/${mediaId}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${getAccessToken() ?? ""}`,
        "X-Client-Platform": "web",
      },
      credentials: "include",
    });
    onMediaChange(media.filter((m) => m.id !== mediaId));
  }

  return (
    <div className="flex flex-col gap-4">
      <span className="text-sm font-medium">{t("events.wizard.media")}</span>

      {media.length === 0 ? (
        <p className="text-sm text-muted">{t("events.wizard.mediaEmpty")}</p>
      ) : (
        <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4">
          {media.map((item) => (
            <li
              key={item.id}
              className="group relative aspect-[3/4] overflow-hidden rounded-lg bg-surface"
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- external MinIO URLs */}
              <img
                src={item.thumbnailUrl}
                alt=""
                className="h-full w-full object-cover"
                style={
                  item.focalX
                    ? {
                        objectPosition: `${Number(item.focalX) * 100}% ${Number(item.focalY) * 100}%`,
                      }
                    : undefined
                }
              />
              <button
                type="button"
                onClick={() => handleDelete(item.id)}
                className="absolute right-1 top-1 hidden h-6 w-6 items-center justify-center rounded-full bg-black/70 text-xs text-white group-hover:flex"
                aria-label="Remove"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}

      {media.length < 10 && (
        <div>
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime"
            onChange={handleFileChange}
            className="hidden"
            id="media-upload"
          />
          <label
            htmlFor="media-upload"
            className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-surface"
          >
            {uploading ? t("common.loading") : t("events.wizard.mediaUpload")}
          </label>
        </div>
      )}

      {media.length >= 10 && (
        <p className="text-xs text-muted">
          {t("events.wizard.mediaLimitReached")}
        </p>
      )}

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
