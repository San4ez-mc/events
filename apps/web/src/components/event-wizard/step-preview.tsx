"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "@/lib/locale-context";
import { getAccessToken } from "@/lib/api-client";
import { ApiRequestError } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import type { EventStatus } from "@kiro/types";

interface StepPreviewProps {
  eventId: string;
  slug: string;
  status: EventStatus;
  onStatusChange: (status: EventStatus) => void;
}

export function StepPreview({
  eventId,
  slug,
  status,
  onStatusChange,
}: StepPreviewProps) {
  const { t } = useTranslations();
  const [balance, setBalance] = useState<number | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<{ code: string; message: string } | null>(
    null,
  );
  const [claiming, setClaiming] = useState(false);

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/v1/credits/balance", {
        headers: { Authorization: `Bearer ${getAccessToken() ?? ""}` },
      });
      if (res.ok) setBalance((await res.json()).balance);
    })();
  }, [status]);

  async function handlePublish() {
    setError(null);
    setPublishing(true);
    try {
      const res = await fetch(`/api/v1/events/${eventId}/publish`, {
        method: "POST",
        headers: { Authorization: `Bearer ${getAccessToken() ?? ""}` },
      });
      const body = await res.json();
      if (!res.ok) throw new ApiRequestError(body);
      onStatusChange(body.status);
    } catch (err) {
      if (err instanceof ApiRequestError) {
        setError({ code: err.code, message: t(`errors.${err.code}`) });
      } else {
        setError({ code: "UNKNOWN", message: t("common.somethingWentWrong") });
      }
    } finally {
      setPublishing(false);
    }
  }

  async function handleClaimFree() {
    setClaiming(true);
    try {
      const res = await fetch("/api/v1/credits/claim-free", {
        method: "POST",
        headers: { Authorization: `Bearer ${getAccessToken() ?? ""}` },
      });
      if (res.ok) {
        const body = await res.json();
        setBalance(body.balance);
        setError(null);
      }
    } finally {
      setClaiming(false);
    }
  }

  return (
    <div className="flex flex-col items-center gap-4 rounded-lg border border-dashed border-border p-10 text-center">
      <p className="text-muted">{t("events.wizard.previewHint")}</p>
      <Link href={`/events/${slug}`} target="_blank">
        <Button variant="secondary">{t("events.wizard.openPreview")}</Button>
      </Link>

      {status === "DRAFT" && (
        <div className="flex w-full flex-col items-center gap-3 border-t border-border pt-4">
          {balance !== null && (
            <p className="text-sm text-muted">
              {t("events.wizard.creditsBalance")}: <strong>{balance}</strong>
            </p>
          )}

          <Button onClick={handlePublish} loading={publishing}>
            {t("events.wizard.publish")}
          </Button>

          {error && (
            <div className="flex flex-col items-center gap-2">
              <p role="alert" className="text-sm text-danger">
                {error.message}
              </p>
              {error.code === "INSUFFICIENT_LISTING_CREDITS" && (
                <div className="flex gap-2">
                  <Button
                    variant="secondary"
                    onClick={handleClaimFree}
                    loading={claiming}
                  >
                    {t("events.wizard.claimFreeCredits")}
                  </Button>
                  <Link href="/credits" target="_blank">
                    <Button variant="secondary">
                      {t("events.wizard.buyCredits")}
                    </Button>
                  </Link>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {status === "PUBLISHED" && (
        <p className="rounded-md bg-success/10 px-4 py-2 text-sm text-success">
          {t("events.wizard.publishSuccess")}
        </p>
      )}

      {status === "PENDING_MODERATION" && (
        <p className="rounded-md bg-surface px-4 py-2 text-sm text-muted">
          {t("events.wizard.publishPendingModeration")}
        </p>
      )}

      {status === "REJECTED" && (
        <p role="alert" className="rounded-md px-4 py-2 text-sm text-danger">
          {t("events.wizard.publishRejected")}
        </p>
      )}
    </div>
  );
}
