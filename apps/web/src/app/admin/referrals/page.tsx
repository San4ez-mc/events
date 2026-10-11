"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "@/lib/locale-context";
import { formatDateTime } from "@/lib/format";
import { getAccessToken } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

interface Claim {
  id: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  note: string | null;
  createdAt: string;
  user: { id: string; name: string | null; nickname: string | null; email: string };
  event: { id: string; title: string; slug: string } | null;
}
interface Stats {
  shareImages30d: number;
  claimsPending: number;
  claimsApproved: number;
}

const FILTERS = ["PENDING", "ALL"] as const;
const auth = () => ({ Authorization: `Bearer ${getAccessToken() ?? ""}`, "Content-Type": "application/json" });
const isLink = (s: string | null) => !!s && /^https?:\/\//i.test(s.trim());

/** Claims for credits from people who shared an event (story / post) and tagged @kiro.ukraine: open the link, approve or reject. */
export default function AdminReferralsPage() {
  const { t, locale } = useTranslations();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("PENDING");
  const [claims, setClaims] = useState<Claim[] | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [list, st] = await Promise.all([
      fetch(`/api/v1/admin/referrals${filter === "PENDING" ? "?status=PENDING" : ""}`, { headers: auth() }).catch(() => null),
      fetch("/api/v1/admin/referrals/stats", { headers: auth() }).catch(() => null),
    ]);
    if (list?.ok) setClaims(((await list.json()) as { items: Claim[] }).items);
    if (st?.ok) setStats((await st.json()) as Stats);
  }, [filter]);

  useEffect(() => {
    queueMicrotask(() => void load());
  }, [load]);

  async function resolve(id: string, status: "APPROVED" | "REJECTED") {
    setBusy(id);
    try {
      const rejectionReason = status === "REJECTED" ? (window.prompt(t("admin.referrals.referralsRejectedReason")) ?? undefined) : undefined;
      const res = await fetch(`/api/v1/admin/referrals/${id}/resolve`, { method: "PATCH", headers: auth(), body: JSON.stringify({ status, rejectionReason: rejectionReason || undefined }) });
      if (res.ok) await load();
      else window.alert(t("common.somethingWentWrong"));
    } finally {
      setBusy(null);
    }
  }

  const a = (k: string) => t(`admin.referrals.${k}`);
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="mb-4 text-2xl font-bold">{a("referralsTitle")}</h1>
      {stats && (
        <div className="mb-5 grid grid-cols-3 gap-3 text-center text-sm">
          {[
            [stats.shareImages30d, a("referralsStats")],
            [stats.claimsPending, a("referralsFilterPending")],
            [stats.claimsApproved, t("referral.status.APPROVED")],
          ].map(([n, label]) => (
            <div key={String(label)} className="rounded-[14px] border border-border bg-surface p-3">
              <p className="text-2xl font-extrabold">{n}</p>
              <p className="text-xs text-muted">{label}</p>
            </div>
          ))}
        </div>
      )}
      <div className="mb-4 flex gap-2">
        {FILTERS.map((f) => (
          <button key={f} type="button" onClick={() => setFilter(f)} className={`rounded-full border px-4 py-1.5 text-sm font-semibold ${filter === f ? "accent-gradient border-transparent text-white" : "border-border"}`}>
            {f === "PENDING" ? a("referralsFilterPending") : a("referralsFilterAll")}
          </button>
        ))}
      </div>
      {claims === null && <Spinner />}
      {claims?.length === 0 && <p className="text-muted">{a("referralsEmpty")}</p>}
      <ul className="flex flex-col gap-3">
        {claims?.map((c) => (
          <li key={c.id} className="rounded-[14px] border border-border bg-surface p-4 text-sm">
            <p className="font-semibold">
              {a("referralsFrom")}: {c.user.name ?? c.user.nickname ?? c.user.email}
            </p>
            {c.event && (
              <p className="text-muted">
                {a("referralsEvent")}: {c.event.title}
              </p>
            )}
            <p className="mt-1">
              {a("referralsLink")}:{" "}
              {isLink(c.note) ? (
                <a href={c.note!} target="_blank" rel="noopener noreferrer" className="break-all text-[var(--accent-from)] underline">
                  {c.note}
                </a>
              ) : (
                <b className="break-all">{c.note ?? "—"}</b>
              )}
            </p>
            <p className="mb-3 text-xs text-muted">{formatDateTime(c.createdAt, locale)} · {t(`referral.status.${c.status}`)}</p>
            {c.status === "PENDING" && (
              <div className="flex gap-2">
                <Button loading={busy === c.id} onClick={() => void resolve(c.id, "APPROVED")}>{a("referralsApprove")}</Button>
                <Button variant="secondary" loading={busy === c.id} onClick={() => void resolve(c.id, "REJECTED")}>{a("referralsReject")}</Button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
