"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useTranslations } from "@/lib/locale-context";
import { getAccessToken } from "@/lib/api-client";
import type { EventInvitation } from "@/lib/event-types";
import { Button } from "@/components/ui/button";

/** §71 — the invitee's side: pending invitations to events organizers think they'd enjoy. */
export default function MyInvitationsPage() {
  const { user, isLoading: authLoading } = useAuth();
  const { t } = useTranslations();
  const router = useRouter();

  const [items, setItems] = useState<EventInvitation[] | null>(null);
  const [error, setError] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const token = getAccessToken();
    if (!token) return;
    const res = await fetch(`/api/v1/invitations/mine`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) {
      setError(true);
      return;
    }
    setItems((await res.json()) as EventInvitation[]);
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace("/login?next=/invitations");
      return;
    }
    queueMicrotask(() => void load());
  }, [authLoading, user, router, load]);

  async function respond(invitationId: string, action: "accept" | "decline") {
    const token = getAccessToken();
    if (!token) return;
    setBusyId(invitationId);
    try {
      const res = await fetch(`/api/v1/invitations/${invitationId}/${action}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setItems((prev) => (prev ? prev.filter((i) => i.id !== invitationId) : prev));
      }
    } finally {
      setBusyId(null);
    }
  }

  if (authLoading || (!user && !error)) return null;

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="mb-6 text-2xl font-bold">{t("invitations.title")}</h1>

      {error && <p className="text-danger">{t("common.somethingWentWrong")}</p>}
      {!error && items === null && <p className="text-muted">{t("common.loading")}</p>}
      {!error && items !== null && items.length === 0 && <p className="text-muted">{t("invitations.empty")}</p>}

      {!error && items !== null && items.length > 0 && (
        <ul className="flex flex-col gap-3">
          {items.map((invitation) => (
            <li
              key={invitation.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-border p-4"
            >
              <div>
                <Link href={`/events/${invitation.event.slug}`} className="font-medium hover:underline">
                  {invitation.event.title}
                </Link>
                {invitation.event.startsAt && (
                  <p className="text-xs text-muted">{new Date(invitation.event.startsAt).toLocaleString()}</p>
                )}
              </div>
              <div className="flex gap-2">
                <Button
                  loading={busyId === invitation.id}
                  onClick={() => void respond(invitation.id, "accept")}
                >
                  {t("invitations.accept")}
                </Button>
                <Button
                  variant="secondary"
                  loading={busyId === invitation.id}
                  onClick={() => void respond(invitation.id, "decline")}
                >
                  {t("invitations.decline")}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
