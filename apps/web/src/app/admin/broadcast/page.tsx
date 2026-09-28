"use client";

import { useState } from "react";
import { useTranslations } from "@/lib/locale-context";
import { getAccessToken } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/text-field";

/** §40 (UX) — manual/system announcement to every active user (in-app + push). ADMIN / SUPER_ADMIN only on the server. */
export default function AdminBroadcastPage() {
  const { t } = useTranslations();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [titleEn, setTitleEn] = useState("");
  const [bodyEn, setBodyEn] = useState("");
  const [busy, setBusy] = useState(false);
  const [recipients, setRecipients] = useState<number | null>(null);
  const [error, setError] = useState(false);

  async function send() {
    const token = getAccessToken();
    if (!token || title.trim().length < 2 || body.trim().length < 2) return;
    // A sent broadcast can't be recalled, so make the admin confirm it explicitly.
    if (!window.confirm(t("admin.broadcast.confirm"))) return;
    setBusy(true);
    setError(false);
    setRecipients(null);
    try {
      const res = await fetch("/api/v1/admin/notifications/broadcast", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          body: body.trim(),
          titleEn: titleEn.trim() || undefined,
          bodyEn: bodyEn.trim() || undefined,
        }),
      });
      if (!res.ok) {
        setError(true);
        return;
      }
      setRecipients(((await res.json()) as { recipients: number }).recipients);
      setTitle("");
      setBody("");
      setTitleEn("");
      setBodyEn("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="mb-2 text-2xl font-bold">{t("admin.broadcast.title")}</h1>
      <p className="mb-6 text-sm text-muted">{t("admin.broadcast.hint")}</p>

      <div className="mb-4">
        <TextField label={t("admin.broadcast.titleUk")} value={title} onChange={setTitle} />
      </div>
      <div className="mb-4">
        <TextField label={t("admin.broadcast.bodyUk")} value={body} onChange={setBody} />
      </div>
      <div className="mb-4">
        <TextField label={t("admin.broadcast.titleEn")} value={titleEn} onChange={setTitleEn} />
      </div>
      <div className="mb-4">
        <TextField label={t("admin.broadcast.bodyEn")} value={bodyEn} onChange={setBodyEn} />
      </div>

      {recipients !== null && (
        <p className="mb-4 text-sm text-success">
          {t("admin.broadcast.sent")}: {recipients}
        </p>
      )}
      {error && <p className="mb-4 text-sm text-danger">{t("common.somethingWentWrong")}</p>}

      <Button onClick={() => void send()} loading={busy} disabled={title.trim().length < 2 || body.trim().length < 2}>
        {t("admin.broadcast.send")}
      </Button>
    </div>
  );
}
