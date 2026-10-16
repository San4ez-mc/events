"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useTranslations } from "@/lib/locale-context";
import { getAccessToken } from "@/lib/api-client";
import { Button } from "@/components/ui/button";

/** Shown to signed-in users who never confirmed their email: it guards password recovery and receipts. */
export function VerifyEmailBanner() {
  const { user } = useAuth();
  const { t } = useTranslations();
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  if (!user || user.emailVerifiedAt) return null;

  async function resend() {
    setState("sending");
    const res = await fetch("/api/v1/auth/resend-verification", { method: "POST", headers: { Authorization: `Bearer ${getAccessToken() ?? ""}` } }).catch(() => null);
    setState(res?.ok ? "sent" : "error");
  }

  return (
    <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-[14px] border border-[var(--accent-from)] bg-surface px-4 py-3 text-sm">
      <span className="min-w-0 flex-1">
        <strong className="block">{t("verify.title")}</strong>
        <span className="text-muted">{t("verify.text")}</span>
      </span>
      {state === "sent" ? (
        <span className="font-semibold text-success">{t("verify.sent")}</span>
      ) : (
        <Button variant="secondary" loading={state === "sending"} onClick={() => void resend()}>
          {t("verify.resend")}
        </Button>
      )}
    </div>
  );
}
