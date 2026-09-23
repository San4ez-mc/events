"use client";

import { useState } from "react";
import { useTranslations } from "@/lib/locale-context";
import { getAccessToken } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/text-field";

export default function AdminCreditsPage() {
  const { t } = useTranslations();
  const [userId, setUserId] = useState("");
  const [delta, setDelta] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [newBalance, setNewBalance] = useState<number | null>(null);
  const [error, setError] = useState(false);

  async function adjust() {
    const token = getAccessToken();
    const deltaNum = Number(delta);
    if (!token || !userId.trim() || !delta || deltaNum === 0 || !description.trim()) return;
    setBusy(true);
    setError(false);
    setNewBalance(null);
    try {
      const res = await fetch("/api/v1/admin/credits/adjust", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ userId: userId.trim(), delta: deltaNum, description: description.trim() }),
      });
      if (!res.ok) {
        setError(true);
        return;
      }
      const body = (await res.json()) as { balance: number };
      setNewBalance(body.balance);
      setDelta("");
      setDescription("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="mb-6 text-2xl font-bold">{t("admin.credits.title")}</h1>

      <div className="mb-4">
        <TextField label={t("admin.credits.userId")} value={userId} onChange={setUserId} />
      </div>
      <div className="mb-4">
        <TextField label={t("admin.credits.delta")} type="number" value={delta} onChange={setDelta} />
      </div>
      <div className="mb-4">
        <TextField label={t("admin.credits.description")} value={description} onChange={setDescription} />
      </div>

      {newBalance !== null && (
        <p className="mb-4 text-sm text-success">
          {t("admin.credits.newBalance")}: {newBalance}
        </p>
      )}
      {error && <p className="mb-4 text-sm text-danger">{t("common.somethingWentWrong")}</p>}

      <Button
        disabled={!userId.trim() || !delta || Number(delta) === 0 || !description.trim()}
        loading={busy}
        onClick={() => void adjust()}
      >
        {t("admin.credits.adjust")}
      </Button>
    </div>
  );
}
