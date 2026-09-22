"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useTranslations } from "@/lib/locale-context";
import { getAccessToken } from "@/lib/api-client";
import { Button } from "@/components/ui/button";

/** UX §25 — "🔔 Стежити" on an event page; subscribes to the event + the organizer's category. */
export function FollowButton({ eventId }: { eventId: string }) {
  const { t } = useTranslations();
  const { user, isLoading: authLoading } = useAuth();
  const [following, setFollowing] = useState<boolean | undefined>(undefined);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (authLoading || !user) return;
    const token = getAccessToken();
    if (!token) return;
    (async () => {
      const res = await fetch("/api/v1/subscriptions/mine", { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) return;
      const subs = (await res.json()) as { scope: string; eventId: string | null }[];
      setFollowing(subs.some((s) => s.scope === "EVENT" && s.eventId === eventId));
    })();
  }, [authLoading, user, eventId]);

  async function toggle() {
    const token = getAccessToken();
    if (!token) return;
    setPending(true);
    try {
      await fetch(`/api/v1/events/${eventId}/subscribe`, {
        method: following ? "DELETE" : "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      setFollowing((f) => !f);
    } finally {
      setPending(false);
    }
  }

  if (authLoading || !user || following === undefined) return null;

  return (
    <Button variant="secondary" onClick={() => void toggle()} loading={pending}>
      🔔 {following ? t("profile.following") : t("profile.follow")}
    </Button>
  );
}
