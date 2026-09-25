"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Camera } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useTranslations } from "@/lib/locale-context";
import { getAccessToken } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/text-field";

type SocialType =
  "INSTAGRAM" | "TELEGRAM" | "FACEBOOK" | "TIKTOK" | "WEBSITE" | "OTHER";
const SOCIAL_TYPES: SocialType[] = [
  "INSTAGRAM",
  "TELEGRAM",
  "FACEBOOK",
  "TIKTOK",
  "WEBSITE",
  "OTHER",
];

interface Prefs {
  allowPush: boolean;
  allowEmail: boolean;
  allowFriendActivityNotifications: boolean;
  allowSubscriptionNotifications: boolean;
  allowEventReminderNotifications: boolean;
  hideSocialLinks: boolean;
  hideUpcomingEvents: boolean;
  hideAttendanceHistory: boolean;
}

interface Me {
  id: string;
  name: string | null;
  nickname: string | null;
  bio: string | null;
  phone: string | null;
  birthDate: string | null;
  avatarUrl: string | null;
  locale: "uk" | "en";
  preferences: Prefs | null;
  socialLinks?: { type: SocialType; url: string }[];
}

const TOGGLES: { key: keyof Prefs; labelKey: string }[] = [
  { key: "allowPush", labelKey: "profile.notifyPush" },
  { key: "allowEmail", labelKey: "profile.notifyEmail" },
  {
    key: "allowFriendActivityNotifications",
    labelKey: "profile.notifyFriends",
  },
  {
    key: "allowSubscriptionNotifications",
    labelKey: "profile.notifySubscriptions",
  },
  {
    key: "allowEventReminderNotifications",
    labelKey: "profile.notifyReminders",
  },
  { key: "hideSocialLinks", labelKey: "profile.hideSocialLinks" },
  { key: "hideUpcomingEvents", labelKey: "profile.hideUpcomingEvents" },
  { key: "hideAttendanceHistory", labelKey: "profile.hideAttendanceHistory" },
];

/** §21/§23 — own profile: photo, basic data, language, privacy toggles, notification opt-outs. */
export default function ProfilePage() {
  const { user, isLoading: authLoading } = useAuth();
  const { t } = useTranslations();
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  const [me, setMe] = useState<Me | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [status, setStatus] = useState<"idle" | "saved" | "failed">("idle");

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace("/login?next=/profile");
      return;
    }
    let cancelled = false;
    (async () => {
      const token = getAccessToken();
      if (!token) return;
      const res = await fetch("/api/v1/users/me", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!cancelled && res.ok) setMe((await res.json()) as Me);
    })();
    return () => {
      cancelled = true;
    };
  }, [authLoading, user, router]);

  if (!me)
    return <p className="px-4 py-10 text-muted">{t("common.loading")}</p>;

  function patch(changes: Partial<Me>) {
    setMe((prev) => (prev ? { ...prev, ...changes } : prev));
    setStatus("idle");
  }

  async function save() {
    const token = getAccessToken();
    if (!token || !me) return;
    setSaving(true);
    setStatus("idle");
    const headers = {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    };
    try {
      const profile = await fetch("/api/v1/users/me", {
        method: "PATCH",
        headers,
        body: JSON.stringify({
          name: me.name ?? undefined,
          nickname: me.nickname || undefined,
          bio: me.bio ?? undefined,
          phone: me.phone || undefined,
          birthDate: me.birthDate ? me.birthDate.slice(0, 10) : undefined,
          locale: me.locale,
        }),
      });
      const prefs = me.preferences
        ? await fetch("/api/v1/users/me/preferences", {
            method: "PATCH",
            headers,
            body: JSON.stringify({
              allowPush: me.preferences.allowPush,
              allowEmail: me.preferences.allowEmail,
              allowFriendActivityNotifications:
                me.preferences.allowFriendActivityNotifications,
              allowSubscriptionNotifications:
                me.preferences.allowSubscriptionNotifications,
              allowEventReminderNotifications:
                me.preferences.allowEventReminderNotifications,
              hideSocialLinks: me.preferences.hideSocialLinks,
              hideUpcomingEvents: me.preferences.hideUpcomingEvents,
              hideAttendanceHistory: me.preferences.hideAttendanceHistory,
            }),
          })
        : null;
      const links = await fetch("/api/v1/users/me/social-links", {
        method: "PUT",
        headers,
        body: JSON.stringify({
          links: (me.socialLinks ?? []).filter((l) => l.url.trim()),
        }),
      });
      setStatus(
        profile.ok && links.ok && (!prefs || prefs.ok) ? "saved" : "failed",
      );
    } catch {
      setStatus("failed");
    } finally {
      setSaving(false);
    }
  }

  async function uploadAvatar(file: File) {
    const token = getAccessToken();
    if (!token) return;
    setUploading(true);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/v1/users/me/avatar", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body,
      });
      if (res.ok) patch({ avatarUrl: (await res.json()).avatarUrl });
      else setStatus("failed");
    } finally {
      setUploading(false);
    }
  }

  const initial = (me.name ?? me.nickname ?? "K")
    .trim()
    .charAt(0)
    .toUpperCase();

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-6 px-4 py-10">
      <h1 className="text-2xl font-bold">{t("nav.profile")}</h1>

      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="accent-gradient relative flex h-20 w-20 items-center justify-center overflow-hidden rounded-full text-3xl font-extrabold text-white"
          aria-label={t("profile.changePhoto")}
        >
          {me.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={me.avatarUrl}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : (
            initial
          )}
          <span className="absolute inset-x-0 bottom-0 flex justify-center bg-black/40 py-1">
            <Camera size={14} aria-hidden="true" />
          </span>
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void uploadAvatar(file);
            e.target.value = "";
          }}
        />
        <div className="text-sm text-muted">
          {uploading ? t("common.loading") : t("profile.changePhoto")}
        </div>
      </div>

      <TextField
        label={t("auth.register.name")}
        value={me.name ?? ""}
        onChange={(v) => patch({ name: v })}
        autoComplete="name"
      />
      <TextField
        label={t("auth.register.nickname")}
        value={me.nickname ?? ""}
        onChange={(v) => patch({ nickname: v })}
      />

      <div className="flex flex-col gap-1.5">
        <label htmlFor="bio" className="text-sm font-medium">
          {t("profile.bio")}
        </label>
        <textarea
          id="bio"
          rows={4}
          maxLength={1000}
          value={me.bio ?? ""}
          onChange={(e) => patch({ bio: e.target.value })}
          className="rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--accent-from)]"
        />
      </div>

      <div>
        <TextField
          label={t("profile.phone")}
          type="tel"
          value={me.phone ?? ""}
          onChange={(v) => patch({ phone: v })}
          autoComplete="tel"
        />
        <p className="mt-1 text-xs text-muted">{t("profile.phoneHint")}</p>
      </div>

      <div>
        <TextField
          label={t("profile.birthDate")}
          type="date"
          value={me.birthDate ? me.birthDate.slice(0, 10) : ""}
          onChange={(v) => patch({ birthDate: v || null })}
        />
        <p className="mt-1 text-xs text-muted">{t("profile.birthDateHint")}</p>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="locale" className="text-sm font-medium">
          {t("profile.language")}
        </label>
        <select
          id="locale"
          value={me.locale}
          onChange={(e) => patch({ locale: e.target.value as "uk" | "en" })}
          className="rounded-md border border-border bg-background px-3 py-2 text-sm"
        >
          <option value="uk">Українська</option>
          <option value="en">English</option>
        </select>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold">{t("profile.socialLinks")}</h2>
        {(me.socialLinks ?? []).map((link, i) => (
          <div key={i} className="flex gap-2">
            <select
              value={link.type}
              onChange={(e) =>
                patch({
                  socialLinks: (me.socialLinks ?? []).map((l, idx) =>
                    idx === i
                      ? { ...l, type: e.target.value as SocialType }
                      : l,
                  ),
                })
              }
              aria-label={t("profile.socialType")}
              className="rounded-md border border-border bg-background px-2 py-2 text-sm"
            >
              {SOCIAL_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
            <input
              type="url"
              value={link.url}
              placeholder="https://"
              onChange={(e) =>
                patch({
                  socialLinks: (me.socialLinks ?? []).map((l, idx) =>
                    idx === i ? { ...l, url: e.target.value } : l,
                  ),
                })
              }
              aria-label={t("profile.socialUrl")}
              className="min-w-0 flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
            <button
              type="button"
              onClick={() =>
                patch({
                  socialLinks: (me.socialLinks ?? []).filter(
                    (_, idx) => idx !== i,
                  ),
                })
              }
              aria-label={t("common.delete")}
              className="rounded-md border border-border px-3 hover:bg-surface"
            >
              ×
            </button>
          </div>
        ))}
        {(me.socialLinks ?? []).length < 8 && (
          <button
            type="button"
            onClick={() =>
              patch({
                socialLinks: [
                  ...(me.socialLinks ?? []),
                  { type: "INSTAGRAM", url: "" },
                ],
              })
            }
            className="min-h-10 rounded-md border border-dashed border-border text-sm font-medium hover:bg-surface"
          >
            + {t("profile.addSocialLink")}
          </button>
        )}
      </section>

      {me.preferences && (
        <fieldset className="flex flex-col gap-3 rounded-2xl border border-border p-4">
          <legend className="px-2 text-sm font-semibold">
            {t("profile.settings")}
          </legend>
          {TOGGLES.map(({ key, labelKey }) => (
            <label
              key={key}
              className="flex items-center justify-between gap-4 text-sm"
            >
              <span>{t(labelKey)}</span>
              <input
                type="checkbox"
                className="h-5 w-5 accent-[var(--accent-from)]"
                checked={me.preferences![key]}
                onChange={(e) =>
                  patch({
                    preferences: {
                      ...me.preferences!,
                      [key]: e.target.checked,
                    },
                  })
                }
              />
            </label>
          ))}
        </fieldset>
      )}

      <div className="flex items-center gap-3">
        <Button onClick={save} loading={saving}>
          {t("common.save")}
        </Button>
        <Link
          href={`/users/${me.id}`}
          className="text-sm text-muted hover:underline"
        >
          {t("profile.viewPublic")}
        </Link>
        {status === "saved" && (
          <span className="text-sm text-green-600">{t("profile.saved")}</span>
        )}
        {status === "failed" && (
          <span className="text-sm text-danger">{t("profile.saveFailed")}</span>
        )}
      </div>
    </div>
  );
}
