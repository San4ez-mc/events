"use client";

import { useEffect, useState } from "react";
import { IoCheckmark, IoCopyOutline, IoPersonAdd, IoShareSocialOutline } from "react-icons/io5";
import { useTranslations } from "@/lib/locale-context";
import { getAccessToken } from "@/lib/api-client";

interface MyInvites {
  code: string;
  link: string;
  clicks: number;
  total: number;
  organizers: number;
  invited: { id: string; name: string; joinedAt: string; isOrganizer: boolean; eventsPublished: number }[];
}

/** "Invite organizers": the person's own link, and what came of it (opened, signed up, became organizers). */
export function InviteCard() {
  const { t } = useTranslations();
  const [data, setData] = useState<MyInvites | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/v1/users/me/invites", { headers: { Authorization: `Bearer ${getAccessToken() ?? ""}` } }).catch(() => null);
      if (res?.ok) setData((await res.json()) as MyInvites);
    })();
  }, []);

  if (!data) return null;

  async function copy() {
    try {
      await navigator.clipboard.writeText(data!.link);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked: the link is selectable on screen.
    }
  }

  async function share() {
    try {
      if (navigator.share) await navigator.share({ title: t("admin.invites.title"), text: t("admin.invites.shareText"), url: data!.link });
      else await copy();
    } catch {
      // The person closed the share sheet.
    }
  }

  const stat = (value: number, label: string) => (
    <div className="flex-1 rounded-xl bg-background px-2 py-2 text-center">
      <p className="text-lg font-extrabold">{value}</p>
      <p className="text-[11px] leading-tight text-muted">{label}</p>
    </div>
  );

  return (
    <section className="flex flex-col gap-3 rounded-[18px] bg-surface p-4">
      <div className="flex items-center gap-3">
        <span className="accent-gradient flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white">
          <IoPersonAdd className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h2 className="text-[15px] font-bold">{t("admin.invites.title")}</h2>
          <p className="text-xs text-muted">{t("admin.invites.subtitle")}</p>
        </div>
      </div>
      <p className="break-all rounded-xl bg-background px-3 py-2.5 text-sm font-medium select-all">{data.link}</p>
      <div className="flex gap-2">
        <button type="button" onClick={() => void copy()} className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-border px-3 py-2.5 text-sm font-bold">
          {copied ? <IoCheckmark className="h-4 w-4" aria-hidden="true" /> : <IoCopyOutline className="h-4 w-4" aria-hidden="true" />}
          {copied ? t("admin.invites.copied") : t("admin.invites.copy")}
        </button>
        <button type="button" onClick={() => void share()} className="accent-gradient flex flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-bold text-white">
          <IoShareSocialOutline className="h-4 w-4" aria-hidden="true" />
          {t("admin.invites.share")}
        </button>
      </div>
      <div className="flex gap-2">
        {stat(data.clicks, t("admin.invites.clicks"))}
        {stat(data.total, t("admin.invites.joined"))}
        {stat(data.organizers, t("admin.invites.organizers"))}
      </div>
      {data.total === 0 && <p className="text-xs text-muted">{t("admin.invites.empty")}</p>}
    </section>
  );
}
