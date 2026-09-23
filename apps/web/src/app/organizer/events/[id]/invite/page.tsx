"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useTranslations } from "@/lib/locale-context";
import { getAccessToken } from "@/lib/api-client";
import type { InvitationCandidate } from "@/lib/event-types";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/text-field";

/** §71 — invite people who attended this organizer's past events to a new one. */
export default function InvitePreviousParticipantsPage() {
  const { id } = useParams<{ id: string }>();
  const { user, isLoading: authLoading } = useAuth();
  const { t } = useTranslations();
  const router = useRouter();

  const [query, setQuery] = useState("");
  const [candidates, setCandidates] = useState<InvitationCandidate[] | null>(null);
  const [error, setError] = useState(false);
  const [invitedIds, setInvitedIds] = useState<Set<string>>(new Set());
  const [busyId, setBusyId] = useState<string | null>(null);

  const search = useCallback(
    async (q: string) => {
      const token = getAccessToken();
      if (!token) return;
      const params = q ? `?q=${encodeURIComponent(q)}` : "";
      const res = await fetch(`/api/v1/events/${id}/invitations/candidates${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        setError(true);
        return;
      }
      setCandidates((await res.json()) as InvitationCandidate[]);
    },
    [id],
  );

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace(`/login?next=/organizer/events/${id}/invite`);
      return;
    }
    queueMicrotask(() => void search(""));
  }, [authLoading, user, id, router, search]);

  async function invite(inviteeUserId: string) {
    const token = getAccessToken();
    if (!token) return;
    setBusyId(inviteeUserId);
    try {
      const res = await fetch(`/api/v1/events/${id}/invitations`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ inviteeUserId }),
      });
      if (res.ok) {
        setInvitedIds((prev) => new Set(prev).add(inviteeUserId));
      }
    } finally {
      setBusyId(null);
    }
  }

  if (authLoading || (!user && !error)) return null;

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="mb-6 text-2xl font-bold">{t("organizerInvite.title")}</h1>

      <div className="mb-6">
        <TextField
          label={t("organizerInvite.search")}
          value={query}
          onChange={(value) => {
            setQuery(value);
            void search(value);
          }}
          placeholder={t("organizerInvite.searchPlaceholder")}
        />
      </div>

      {error && <p className="text-danger">{t("common.somethingWentWrong")}</p>}
      {!error && candidates === null && <p className="text-muted">{t("common.loading")}</p>}
      {!error && candidates !== null && candidates.length === 0 && (
        <p className="text-muted">{t("organizerInvite.empty")}</p>
      )}

      {!error && candidates !== null && candidates.length > 0 && (
        <ul className="flex flex-col gap-2">
          {candidates.map((candidate) => (
            <li
              key={candidate.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-border p-3"
            >
              <div>
                <p className="font-medium">{candidate.name ?? candidate.nickname ?? candidate.email}</p>
                <p className="text-xs text-muted">{candidate.email}</p>
              </div>
              <Button
                variant="secondary"
                disabled={invitedIds.has(candidate.id)}
                loading={busyId === candidate.id}
                onClick={() => void invite(candidate.id)}
              >
                {invitedIds.has(candidate.id) ? t("organizerInvite.invited") : t("organizerInvite.invite")}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
