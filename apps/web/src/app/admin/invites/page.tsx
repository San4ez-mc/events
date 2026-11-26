"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "@/lib/locale-context";
import { formatDateTime } from "@/lib/format";
import { getAccessToken } from "@/lib/api-client";
import { Spinner } from "@/components/ui/spinner";

interface Person {
  id: string;
  name: string;
  email: string;
  joinedAt: string;
  isOrganizer: boolean;
  eventsPublished: number;
  paid: boolean;
  paidAmount: number;
}
interface InviterRow {
  inviter: { id: string; name: string; email: string };
  clicks: number;
  downloadClicks: number;
  invited: number;
  organizers: number;
  eventsPublished: number;
  payers: number;
  paidAmount: number;
  people: Person[];
}
interface Overview {
  inviters: InviterRow[];
  totals: { inviters: number; invited: number; organizers: number; payers: number; paidAmount: number };
}
interface Action {
  at: string;
  device: "ANDROID" | "IPHONE" | "DESKTOP" | "OTHER";
}
interface Details {
  visits: Action[];
  downloads: Action[];
  people: (Person & { events?: { title: string; slug: string; status: string }[] })[];
}

type Kind = "visits" | "downloads" | "people" | "organizers" | "payers";

const money = (n: number) => new Intl.NumberFormat("uk-UA", { maximumFractionDigits: 0 }).format(n);

const authHeaders = () => ({ Authorization: `Bearer ${getAccessToken() ?? ""}` });

/**
 * Who invited whom. Every number is a button: tap it to see the list behind it (each open of the link, each "download"
 * press, the people who signed up, the ones who became organizers).
 */
export default function AdminInvitesPage() {
  const { t, locale } = useTranslations();
  const [data, setData] = useState<Overview | null>(null);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState<{ id: string; kind: Kind } | null>(null);
  const [details, setDetails] = useState<Record<string, Details | "loading" | "failed">>({});

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/v1/admin/invites", { headers: authHeaders() }).catch(() => null);
      if (res?.ok) setData((await res.json()) as Overview);
      else setFailed(true);
    })();
  }, []);

  async function choose(id: string, kind: Kind) {
    if (open?.id === id && open.kind === kind) {
      setOpen(null);
      return;
    }
    setOpen({ id, kind });
    if (details[id]) return;
    setDetails((prev) => ({ ...prev, [id]: "loading" }));
    const res = await fetch(`/api/v1/admin/invites/${id}`, { headers: authHeaders() }).catch(() => null);
    const body = res?.ok ? ((await res.json()) as Details) : null;
    setDetails((prev) => ({ ...prev, [id]: body ?? "failed" }));
  }

  const counter = (row: InviterRow, kind: Kind, value: number, label: string) => {
    const active = open?.id === row.inviter.id && open.kind === kind;
    return (
      <button
        type="button"
        onClick={() => void choose(row.inviter.id, kind)}
        aria-expanded={active}
        className={`rounded-xl px-3 py-2 text-center ${active ? "accent-gradient text-white" : "bg-background"}`}
      >
        <span className="block text-lg font-extrabold">{value}</span>
        <span className={`block text-[11px] leading-tight ${active ? "text-white/90" : "text-muted"}`}>{label}</span>
      </button>
    );
  };

  const when = (iso: string) => formatDateTime(iso, locale);

  function renderList(row: InviterRow, kind: Kind) {
    const d = details[row.inviter.id];
    if (d === "loading" || d === undefined) return <Spinner />;
    if (d === "failed") return <p className="text-sm text-danger">{t("common.somethingWentWrong")}</p>;
    if (kind === "visits" || kind === "downloads") {
      const list = kind === "visits" ? d.visits : d.downloads;
      const total = kind === "visits" ? row.clicks : row.downloadClicks;
      return (
        <>
          {list.length === 0 && <p className="text-sm text-muted">{t("admin.invites.emptyList")}</p>}
          <ul className="flex flex-col gap-1.5">
            {list.map((a, i) => (
              <li key={`${a.at}-${i}`} className="flex items-center justify-between gap-3 rounded-lg bg-background px-3 py-2 text-sm">
                <span>{when(a.at)}</span>
                <span className="text-muted">{t(`admin.invites.device${a.device}`)}</span>
              </li>
            ))}
          </ul>
          {total > list.length && <p className="text-xs text-muted">{t("admin.invites.olderWithoutDetails").replace("{n}", String(total - list.length))}</p>}
        </>
      );
    }
    const people = kind === "organizers" ? d.people.filter((p) => p.isOrganizer) : kind === "payers" ? d.people.filter((p) => p.paid) : d.people;
    return (
      <>
        {people.length === 0 && <p className="text-sm text-muted">{t("admin.invites.emptyList")}</p>}
        <ul className="flex flex-col gap-1.5">
          {people.map((p) => (
            <li key={p.id} className="rounded-lg bg-background px-3 py-2 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="min-w-0">
                  <span className="block truncate font-medium">{p.name}</span>
                  <span className="block truncate text-xs text-muted">
                    {p.email} · {when(p.joinedAt)}
                  </span>
                </span>
                {kind === "payers" ? (
                  <span className="shrink-0 rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-bold text-emerald-600">{t("admin.invites.paidAmount").replace("{amount}", money(p.paidAmount))}</span>
                ) : (
                  p.isOrganizer && (
                    <span className="shrink-0 rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-bold text-emerald-600">
                      {t("admin.invites.organizerBadge")} · {p.eventsPublished} {t("admin.invites.events")}
                    </span>
                  )
                )}
              </div>
              {kind === "organizers" && (p.events ?? []).length > 0 && (
                <ul className="mt-1.5 flex flex-col gap-0.5 text-xs text-muted">
                  {(p.events ?? []).map((e) => (
                    <li key={e.slug} className="truncate">
                      • {e.title}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      </>
    );
  }

  const listTitle: Record<Kind, string> = {
    visits: t("admin.invites.listVisits"),
    downloads: t("admin.invites.listDownloads"),
    people: t("admin.invites.listPeople"),
    organizers: t("admin.invites.listOrganizers"),
    payers: t("admin.invites.listPayers"),
  };

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-extrabold">{t("admin.invites.adminTitle")}</h1>
        <p className="text-sm text-muted">{t("admin.invites.adminHint")}</p>
        <p className="text-sm text-muted">{t("admin.invites.tapNumber")}</p>
      </div>

      {failed && <p className="text-danger">{t("common.somethingWentWrong")}</p>}
      {!failed && data === null && <Spinner />}

      {data && (
        <>
          <p className="text-sm font-semibold">
            {t("admin.invites.adminTotals")
              .replace("{inviters}", String(data.totals.inviters))
              .replace("{invited}", String(data.totals.invited))
              .replace("{organizers}", String(data.totals.organizers))}
          </p>
          <p className="text-sm font-semibold">{t("admin.invites.adminPaid").replace("{payers}", String(data.totals.payers)).replace("{amount}", money(data.totals.paidAmount))}</p>
          <p className="text-xs text-muted">{t("admin.invites.paidNote")}</p>
          {data.inviters.length === 0 && <p className="text-muted">{t("admin.invites.adminEmpty")}</p>}
          <ul className="flex flex-col gap-3">
            {data.inviters.map((row) => (
              <li key={row.inviter.id} className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4">
                <div className="min-w-0">
                  <span className="block truncate font-bold">{row.inviter.name}</span>
                  <span className="block truncate text-xs text-muted">{row.inviter.email}</span>
                </div>
                <div className="grid grid-cols-5 gap-2">
                  {counter(row, "visits", row.clicks, t("admin.invites.linkClicks"))}
                  {counter(row, "downloads", row.downloadClicks, t("admin.invites.downloadClicks"))}
                  {counter(row, "people", row.invited, t("admin.invites.people"))}
                  {counter(row, "organizers", row.organizers, t("admin.invites.organizerBadge"))}
                  {counter(row, "payers", row.payers, t("admin.invites.payers"))}
                </div>
                {row.payers > 0 && <p className="text-sm font-semibold text-emerald-600">{t("admin.invites.paidAmount").replace("{amount}", money(row.paidAmount))}</p>}
                {open?.id === row.inviter.id && (
                  <div className="flex flex-col gap-2 border-t border-border pt-3">
                    <h2 className="text-sm font-bold">{listTitle[open.kind]}</h2>
                    {renderList(row, open.kind)}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
