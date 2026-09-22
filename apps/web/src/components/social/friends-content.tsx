"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { useTranslations } from "@/lib/locale-context";
import { getAccessToken } from "@/lib/api-client";
import type { FriendRequest, PublicUser } from "@/lib/social-types";
import { Button } from "@/components/ui/button";

/** UX §24 — friends list + incoming/outgoing friend requests. */
export function FriendsContent() {
  const { t } = useTranslations();
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();

  const [friends, setFriends] = useState<(PublicUser & { friendshipId?: string })[] | null>(null);
  const [incoming, setIncoming] = useState<FriendRequest[] | null>(null);
  const [outgoing, setOutgoing] = useState<FriendRequest[] | null>(null);
  const [actingOnId, setActingOnId] = useState<string | null>(null);

  const authHeaders = useCallback((): HeadersInit | undefined => {
    const token = getAccessToken();
    return token ? { Authorization: `Bearer ${token}` } : undefined;
  }, []);

  const load = useCallback(async () => {
    const headers = authHeaders();
    if (!headers) return;
    const [friendsRes, incomingRes, outgoingRes] = await Promise.all([
      fetch("/api/v1/friends", { headers }),
      fetch("/api/v1/friends/requests/incoming", { headers }),
      fetch("/api/v1/friends/requests/outgoing", { headers }),
    ]);
    if (friendsRes.ok) setFriends(await friendsRes.json());
    if (incomingRes.ok) setIncoming(await incomingRes.json());
    if (outgoingRes.ok) setOutgoing(await outgoingRes.json());
  }, [authHeaders]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace("/login?next=/friends");
      return;
    }
    queueMicrotask(() => void load());
  }, [authLoading, user, router, load]);

  async function respond(requestId: string, action: "accept" | "reject") {
    const headers = authHeaders();
    if (!headers) return;
    setActingOnId(requestId);
    try {
      await fetch(`/api/v1/friends/requests/${requestId}/${action}`, { method: "PATCH", headers });
      await load();
    } finally {
      setActingOnId(null);
    }
  }

  async function cancelRequest(requestId: string) {
    const headers = authHeaders();
    if (!headers) return;
    setActingOnId(requestId);
    try {
      await fetch(`/api/v1/friends/requests/${requestId}/cancel`, { method: "PATCH", headers });
      await load();
    } finally {
      setActingOnId(null);
    }
  }

  if (authLoading || !user) return null;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-8 px-4 py-8">
      <div>
        <h1 className="mb-4 text-lg font-bold accent-gradient-text">{t("friends.title")}</h1>
        {friends === null && <p className="text-sm text-muted">{t("common.loading")}</p>}
        {friends !== null && friends.length === 0 && <p className="text-sm text-muted">{t("friends.empty")}</p>}
        <div className="flex flex-col gap-2">
          {friends?.map((friend) => (
            <Link
              key={friend.id}
              href={`/users/${friend.id}`}
              className="flex items-center gap-3 rounded-lg border border-border p-3 hover:bg-surface"
            >
              <Avatar user={friend} />
              <span className="font-medium">{friend.name ?? friend.nickname}</span>
            </Link>
          ))}
        </div>
      </div>

      <div>
        <h2 className="mb-3 text-sm font-semibold">{t("friends.incoming")}</h2>
        {incoming !== null && incoming.length === 0 && <p className="text-sm text-muted">{t("friends.noIncoming")}</p>}
        <div className="flex flex-col gap-2">
          {incoming?.map((request) => (
            <div key={request.id} className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
              <div className="flex items-center gap-3">
                <Avatar user={request.requester} />
                <span className="font-medium">{request.requester?.name ?? request.requester?.nickname}</span>
              </div>
              <div className="flex gap-2">
                <Button loading={actingOnId === request.id} onClick={() => void respond(request.id, "accept")}>
                  {t("profile.acceptRequest")}
                </Button>
                <Button
                  variant="secondary"
                  loading={actingOnId === request.id}
                  onClick={() => void respond(request.id, "reject")}
                >
                  {t("profile.rejectRequest")}
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h2 className="mb-3 text-sm font-semibold">{t("friends.outgoing")}</h2>
        {outgoing !== null && outgoing.length === 0 && <p className="text-sm text-muted">{t("friends.noOutgoing")}</p>}
        <div className="flex flex-col gap-2">
          {outgoing?.map((request) => (
            <div key={request.id} className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
              <div className="flex items-center gap-3">
                <Avatar user={request.addressee} />
                <span className="font-medium">{request.addressee?.name ?? request.addressee?.nickname}</span>
              </div>
              <Button variant="secondary" loading={actingOnId === request.id} onClick={() => void cancelRequest(request.id)}>
                {t("profile.cancelRequest")}
              </Button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Avatar({ user }: { user?: PublicUser }) {
  const label = (user?.name ?? user?.nickname ?? "?").slice(0, 1).toUpperCase();
  return (
    <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface text-sm font-semibold">
      {user?.avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- external MinIO URLs
        <img src={user.avatarUrl} alt="" className="h-full w-full object-cover" />
      ) : (
        label
      )}
    </div>
  );
}
