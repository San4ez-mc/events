"use client";

import { useEffect, useState } from "react";
import { IoCheckmark, IoCopyOutline, IoPersonAdd, IoShareSocialOutline } from "react-icons/io5";
import { useTranslations } from "@/lib/locale-context";
import { formatDateTime } from "@/lib/format";
import { getAccessToken } from "@/lib/api-client";

interface Action {
  at: string;
  device: "ANDROID" | "IPHONE" | "DESKTOP" | "OTHER";
}
interface MyInvites {
  code: string;
  link: string;
  clicks: number;
  downloadClicks: number;
  total: number;
  organizers: number;
  invited: { id: string; name: string; joinedAt: string; isOrganizer: boolean; eventsPublished: number }[];
  visits: Action[];
  downloads: Action[];
}
type Kind = "visits" | "downloads" | "people" | "organizers";

/** "Invite organizers": the person's own link, and what came of it. Tap a number to see the list behind it. */
export function InviteCard() {
  const { t, locale } = useTranslations();
  const [data, setData] = useState<MyInvites | null>(null);
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState<Kind | null>(null);

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

  const stat = (kind: Kind, value: number, label: string) => (
    <button
      type="button"
      key={kind}
      onClick={() => setOpen(open === kind ? null : kind)}
      aria-expanded={open === kind}
      className={`flex-1 rounded-xl px-1 py-2 text-center ${open === kind ? "accent-gradient text-white" : "bg-background"}`}
    >
      <span className="block text-lg font-extrabold">{value}</span>
      <span className={`block text-[11px] leading-tight ${open === kind ? "text-white/90" : "text-muted"}`}>{label}</span>
    </button>
  );

  const listTitle: Record<Kind, string> = {
    visits: t("admin.invites.listVisits"),
    downloads: t("admin.invites.listDownloads"),
    people: t("admin.invites.listPeople"),
    organizers: t("admin.invites.listOrganizers"),
  };

  function renderList(kind: Kind) {
    if (kind === "visits" || kind === "downloads") {
      const list = kind === "visits" ? data!.visits : data!.downloads;
      const total = kind === "visits" ? data!.clicks : data!.downloadClicks;
      return (
        <>
          {list.length === 0 && <p className="text-sm text-muted">{t("admin.invites.emptyList")}</p>}
          {list.map((a, i) => (
            <p key={`${a.at}-${i}`} className="flex justify-between gap-3 rounded-lg bg-background px-3 py-2 text-sm">
              <span>{formatDateTime(a.at, locale)}</span>
              <span className="text-muted">{t(`admin.invites.device${a.device}`)}</span>
            </p>
          ))}
          {total > list.length && <p className="text-xs text-muted">{t("admin.invites.olderWithoutDetails").replace("{n}", String(total - list.length))}</p>}
        </>
      );
    }
    const people = kind === "organizers" ? data!.invited.filter((p) => p.isOrganizer) : data!.invited;
    return (
      <>
        {people.length === 0 && <p className="text-sm text-muted">{t("admin.invites.emptyList")}</p>}
        {people.map((p) => (
          <p key={p.id} className="flex justify-between gap-3 rounded-lg bg-background px-3 py-2 text-sm">
            <span className="truncate font-medium">{p.name}</span>
            <span className="shrink-0 text-muted">
              {formatDateTime(p.joinedAt, locale)}
              {p.isOrganizer ? ` · ${p.eventsPublished} ${t("admin.invites.events")}` : ""}
            </span>
          </p>
        ))}
      </>
    );
  }

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
        {stat("visits", data.clicks, t("admin.invites.clicks"))}
        {stat("downloads", data.downloadClicks, t("admin.invites.downloadClicks"))}
        {stat("people", data.total, t("admin.invites.joined"))}
        {stat("organizers", data.organizers, t("admin.invites.organizers"))}
      </div>
      {open ? (
        <div className="flex flex-col gap-1.5 border-t border-border pt-3">
          <h3 className="text-sm font-bold">{listTitle[open]}</h3>
          {renderList(open)}
        </div>
      ) : (
        <p className="text-xs text-muted">{data.total === 0 ? t("admin.invites.empty") : t("admin.invites.tapNumber")}</p>
      )}
    </section>
  );
}
