"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "@/lib/locale-context";
import { formatDateTime } from "@/lib/format";
import { getAccessToken } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

interface FeedbackItem {
  id: string;
  status: "NEW" | "RESOLVED";
  message: string;
  screenshotUrl: string | null;
  context: string | null;
  platform: string | null;
  appVersion: string | null;
  buildNumber: number | null;
  device: string | null;
  createdAt: string;
  user: { id: string; name: string | null; nickname: string | null; email: string } | null;
}

const auth = () => ({ Authorization: `Bearer ${getAccessToken() ?? ""}`, "Content-Type": "application/json" });

/** Problem reports sent from the app ("Повідомити про проблему розробнику"): read, open the screenshot, mark as handled. */
export default function AdminFeedbackPage() {
  const { t, locale } = useTranslations();
  const [onlyNew, setOnlyNew] = useState(true);
  const [items, setItems] = useState<FeedbackItem[] | null>(null);
  const [newCount, setNewCount] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/v1/admin/feedback${onlyNew ? "?status=NEW" : ""}`, { headers: auth() }).catch(() => null);
    if (!res?.ok) return setItems([]);
    const body = (await res.json()) as { items: FeedbackItem[]; newCount: number };
    setItems(body.items);
    setNewCount(body.newCount);
  }, [onlyNew]);

  useEffect(() => {
    queueMicrotask(() => void load());
  }, [load]);

  async function setStatus(id: string, status: "NEW" | "RESOLVED") {
    setBusy(id);
    try {
      const res = await fetch(`/api/v1/admin/feedback/${id}`, { method: "PATCH", headers: auth(), body: JSON.stringify({ status }) });
      if (res.ok) await load();
      else window.alert(t("common.somethingWentWrong"));
    } finally {
      setBusy(null);
    }
  }

  const a = (k: string) => t(`admin.feedback.${k}`);
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="mb-4 text-2xl font-bold">{a("title")}</h1>
      <div className="mb-4 flex gap-2">
        {([true, false] as const).map((only) => (
          <button
            key={String(only)}
            type="button"
            onClick={() => {
              setItems(null);
              setOnlyNew(only);
            }}
            className={`rounded-full border px-4 py-1.5 text-sm font-semibold ${onlyNew === only ? "accent-gradient border-transparent text-white" : "border-border"}`}
          >
            {only ? `${a("filterNew")} (${newCount})` : a("filterAll")}
          </button>
        ))}
      </div>
      {items === null && <Spinner />}
      {items?.length === 0 && <p className="text-muted">{a("empty")}</p>}
      <ul className="flex flex-col gap-3">
        {items?.map((f) => (
          <li key={f.id} className="rounded-[14px] border border-border bg-surface p-4 text-sm">
            <p className="font-semibold">
              {a("from")}: {f.user ? (f.user.name ?? f.user.nickname ?? f.user.email) : a("anonymous")}
              {f.user ? <span className="ml-2 font-normal text-muted">{f.user.email}</span> : null}
            </p>
            <p className="mt-2 whitespace-pre-wrap break-words">{f.message}</p>
            {f.screenshotUrl && (
              <a href={f.screenshotUrl} target="_blank" rel="noopener noreferrer" className="mt-3 inline-block" aria-label={a("screenshot")}>
                {/* eslint-disable-next-line @next/next/no-img-element -- admin-only thumbnail of a user upload, no optimization wanted */}
                <img src={f.screenshotUrl} alt={a("screenshot")} className="h-40 w-40 rounded-md border border-border object-cover" />
              </a>
            )}
            <p className="mt-3 mb-3 text-xs text-muted">
              {[
                formatDateTime(f.createdAt, locale),
                f.context ? `${a("context")}: ${f.context}` : null,
                f.appVersion ? `v${f.appVersion}${f.buildNumber ? ` (${f.buildNumber})` : ""}` : null,
                f.platform,
                f.device ? `${a("device")}: ${f.device}` : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
            {f.status === "NEW" ? (
              <Button loading={busy === f.id} onClick={() => void setStatus(f.id, "RESOLVED")}>{a("resolve")}</Button>
            ) : (
              <Button variant="secondary" loading={busy === f.id} onClick={() => void setStatus(f.id, "NEW")}>{a("reopen")}</Button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
