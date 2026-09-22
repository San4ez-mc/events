"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { useTranslations } from "@/lib/locale-context";
import { getAccessToken } from "@/lib/api-client";
import type { PublicProfile } from "@/lib/social-types";
import { EventResultRow } from "@/components/search/event-result-row";
import { Button } from "@/components/ui/button";

/**
 * UX §22/§82 — public, shareable profile. Client-rendered (not SSR, unlike
 * the event page) — the URL is still shareable, just without SSR metadata;
 * a documented trim given the effort budget for this phase.
 */
export function PublicProfileContent() {
  const { id } = useParams<{ id: string }>();
  const { user, isLoading: authLoading } = useAuth();
  const { t, locale } = useTranslations();

  const [profile, setProfile] = useState<PublicProfile | null | undefined>(undefined);
  const [acting, setActing] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    (async () => {
      const token = getAccessToken();
      const res = await fetch(`/api/v1/users/${id}/profile`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      setProfile(res.ok ? await res.json() : null);
    })();
  }, [authLoading, id]);

  async function sendFriendRequest() {
    const token = getAccessToken();
    if (!token) return;
    setActing(true);
    try {
      const res = await fetch("/api/v1/friends/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ addresseeId: id }),
      });
      if (res.ok) setProfile((p) => (p ? { ...p, relationshipStatus: "PENDING_SENT" } : p));
    } finally {
      setActing(false);
    }
  }

  function share() {
    void navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (authLoading || profile === undefined) {
    return <div className="mx-auto max-w-2xl px-4 py-16 text-center text-muted">{t("common.loading")}</div>;
  }

  if (profile === null) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center text-muted">
        {t("errors.NOT_FOUND")}
      </div>
    );
  }

  const displayName = profile.name ?? profile.nickname ?? "—";

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <div className="mb-6 flex items-center gap-4">
        <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface text-2xl font-semibold">
          {profile.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- external MinIO URLs
            <img src={profile.avatarUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            displayName.slice(0, 1).toUpperCase()
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-bold">{displayName}</h1>
          <p className="text-xs text-muted">
            {t("profile.memberSince")} {new Date(profile.memberSince).toLocaleDateString(locale === "uk" ? "uk-UA" : "en-US")}
          </p>
        </div>
      </div>

      {profile.bio && <p className="mb-6 whitespace-pre-wrap text-sm">{profile.bio}</p>}

      <div className="mb-6 flex gap-6 text-sm text-muted">
        <span>
          <strong className="text-foreground">{profile.friendCount}</strong> {t("profile.friends")}
        </span>
        <span>
          <strong className="text-foreground">{profile.eventsCreatedCount}</strong> {t("profile.eventsCreated")}
        </span>
      </div>

      <div className="mb-8 flex flex-wrap gap-2">
        <Button variant="secondary" onClick={share}>
          {copied ? t("profile.linkCopied") : t("profile.share")}
        </Button>
        {renderFriendAction()}
      </div>

      {profile.socialLinks.length > 0 && (
        <div className="mb-8 flex flex-wrap gap-3 text-sm">
          {profile.socialLinks.map((link) => (
            <a key={link.url} href={link.url} target="_blank" rel="noopener noreferrer" className="text-muted underline">
              {link.type}
            </a>
          ))}
        </div>
      )}

      {profile.upcomingEvents.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold">{t("profile.upcomingEvents")}</h2>
          <div className="flex flex-col gap-2">
            {profile.upcomingEvents.map((event) => (
              <EventResultRow key={event.id} event={event} locale={locale} t={t} />
            ))}
          </div>
        </section>
      )}
    </div>
  );

  function renderFriendAction() {
    if (!user || profile!.relationshipStatus === "SELF") return null;
    switch (profile!.relationshipStatus) {
      case "NONE":
        return (
          <Button onClick={() => void sendFriendRequest()} loading={acting}>
            {t("profile.addFriend")}
          </Button>
        );
      case "PENDING_SENT":
        return (
          <Button variant="secondary" disabled>
            {t("profile.pendingSent")}
          </Button>
        );
      case "PENDING_RECEIVED":
        return (
          <Link href="/friends">
            <Button variant="secondary">{t("profile.pendingReceived")}</Button>
          </Link>
        );
      case "FRIENDS":
        return (
          <Link href="/friends">
            <Button variant="secondary">✓ {t("profile.friends")}</Button>
          </Link>
        );
      default:
        return null;
    }
  }
}
