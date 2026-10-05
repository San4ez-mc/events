"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Camera } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useTranslations } from "@/lib/locale-context";
import { getAccessToken } from "@/lib/api-client";
import { formatPhoneInput } from "@/lib/format";
import { fieldErrorMessage, readFieldErrors, type FieldErrors } from "@/lib/field-errors";
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
  showAge: boolean;
  friendsOnlyProfile: boolean;
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
  { key: "showAge", labelKey: "profile.showAge" },
  { key: "friendsOnlyProfile", labelKey: "profile.friendsOnlyProfile" },
];

/** §21/§23 — own profile: photo, basic data, language, privacy toggles, notification opt-outs. */
export default function ProfilePage() {
  const { user, isLoading: authLoading, logout } = useAuth();
  const { t } = useTranslations();
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  const [me, setMe] = useState<Me | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [status, setStatus] = useState<"idle" | "saved" | "failed">("idle");
  // field -> message, for the inputs the server rejected ("links.2.url" for social link #3)
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteFailed, setDeleteFailed] = useState(false);

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
    setErrors((prev) => {
      const keys = Object.keys(changes).flatMap((k) => (k === "socialLinks" ? Object.keys(prev).filter((e) => e.startsWith("links.")) : [k]));
      if (!keys.some((k) => k in prev)) return prev;
      const next = { ...prev };
      for (const k of keys) delete next[k];
      return next;
    });
  }

  /** Marks the inputs the server rejected, with the reason under each, and brings the first one into view. */
  function showFieldErrors(raw: FieldErrors, sentLinkIndexes: number[]) {
    const next: Record<string, string> = {};
    for (const [field, rules] of Object.entries(raw)) {
      const m = /^links\.(\d+)\.url$/.exec(field);
      // The request only carried the non-empty links, so map the position back to the row the person sees.
      const key = m ? `links.${sentLinkIndexes[Number(m[1])] ?? m[1]}.url` : field;
      next[key] = fieldErrorMessage(t, field.replace(/^links\.\d+\./, ""), rules);
    }
    setErrors(next);
    if (Object.keys(next).length > 0) {
      requestAnimationFrame(() => document.querySelector('[aria-invalid="true"]')?.scrollIntoView({ behavior: "smooth", block: "center" }));
    }
  }

  async function save() {
    const token = getAccessToken();
    if (!token || !me) return;
    setSaving(true);
    setStatus("idle");
    setErrors({});
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
              showAge: me.preferences.showAge,
              friendsOnlyProfile: me.preferences.friendsOnlyProfile,
            }),
          })
        : null;
      const sentLinkIndexes = (me.socialLinks ?? []).flatMap((l, i) => (l.url.trim() ? [i] : []));
      const links = await fetch("/api/v1/users/me/social-links", {
        method: "PUT",
        headers,
        body: JSON.stringify({
          links: (me.socialLinks ?? []).filter((l) => l.url.trim()),
        }),
      });
      if (profile.ok && links.ok && (!prefs || prefs.ok)) {
        setStatus("saved");
      } else {
        const found: FieldErrors = {
          ...(profile.ok ? {} : await readFieldErrors(profile)),
          ...(links.ok ? {} : await readFieldErrors(links)),
        };
        showFieldErrors(found, sentLinkIndexes);
        setStatus("failed");
      }
    } catch {
      setStatus("failed");
    } finally {
      setSaving(false);
    }
  }

  /** Play Store / GDPR: permanently erases the account (see /account-deletion). Two-step confirm, then sign out. */
  async function deleteAccount() {
    const token = getAccessToken();
    if (!token) return;
    setDeleting(true);
    setDeleteFailed(false);
    try {
      const res = await fetch("/api/v1/users/me", {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ confirm: true }),
      });
      if (!res.ok) {
        setDeleteFailed(true);
        return;
      }
      await logout().catch(() => {});
      router.replace("/");
    } finally {
      setDeleting(false);
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
        error={errors.name}
      />
      <TextField
        label={t("auth.register.nickname")}
        value={me.nickname ?? ""}
        onChange={(v) => patch({ nickname: v })}
        error={errors.nickname}
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
          aria-invalid={Boolean(errors.bio)}
          className="rounded-[10px] border border-border bg-surface px-3.5 py-2.5 text-[15px] outline-none focus:border-[var(--accent-from)] focus:ring-2 focus:ring-[var(--accent-from)]/30 aria-invalid:border-danger"
        />
        {errors.bio && (
          <p role="alert" className="text-xs text-danger">
            {errors.bio}
          </p>
        )}
      </div>

      <div>
        <TextField
          label={t("profile.phone")}
          type="tel"
          value={me.phone ?? ""}
          onChange={(v) => patch({ phone: formatPhoneInput(v) })}
          autoComplete="tel"
          error={errors.phone}
        />
        <p className="mt-1 text-xs text-muted">{t("profile.phoneHint")}</p>
      </div>

      <div>
        <TextField
          label={t("profile.birthDate")}
          type="date"
          value={me.birthDate ? me.birthDate.slice(0, 10) : ""}
          onChange={(v) => patch({ birthDate: v || null })}
          error={errors.birthDate}
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
          <div key={i} className="flex flex-col gap-1">
          <div className="flex gap-2">
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
                  {t(`profile.socialTypes.${type}`)}
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
              aria-invalid={Boolean(errors[`links.${i}.url`])}
              className="min-w-0 flex-1 rounded-[10px] border border-border bg-surface px-3 py-2 text-sm aria-invalid:border-danger"
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
          {errors[`links.${i}.url`] && (
            <p role="alert" className="text-xs text-danger">
              {errors[`links.${i}.url`]}
            </p>
          )}
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
          <span className="text-sm text-danger">
            {Object.keys(errors).length > 0 ? t("profile.fixFields") : t("profile.saveFailed")}
          </span>
        )}
      </div>

      <section className="mt-6 rounded-2xl border border-danger/40 p-4">
        <h2 className="mb-1 text-sm font-semibold text-danger">
          {t("profile.deleteAccount")}
        </h2>
        <p className="mb-3 text-xs text-muted">
          {t("profile.deleteAccountHint")}{" "}
          <Link href="/account-deletion" className="underline">
            {t("profile.deleteAccountMore")}
          </Link>
        </p>
        {!confirmingDelete ? (
          <Button variant="secondary" onClick={() => setConfirmingDelete(true)}>
            {t("profile.deleteAccount")}
          </Button>
        ) : (
          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium">
              {t("profile.deleteAccountConfirm")}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => void deleteAccount()}
                disabled={deleting}
                className="inline-flex min-h-11 items-center justify-center rounded-md bg-danger px-4 text-sm font-semibold text-white disabled:opacity-60"
              >
                {deleting ? t("common.loading") : t("profile.deleteAccountYes")}
              </button>
              <Button
                variant="secondary"
                onClick={() => setConfirmingDelete(false)}
              >
                {t("common.cancel")}
              </Button>
            </div>
            {deleteFailed && (
              <p role="alert" className="text-sm text-danger">
                {t("profile.saveFailed")}
              </p>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
