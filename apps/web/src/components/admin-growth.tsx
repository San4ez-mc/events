"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "@/lib/locale-context";
import { formatDateTime } from "@/lib/format";
import { getAccessToken } from "@/lib/api-client";
import { Spinner } from "@/components/ui/spinner";
import { periodQuery, type Period } from "@/components/admin-period";

interface TurnoutRow {
  name: string;
  reports: number;
  registered: number;
  attended: number;
  percent: number | null;
}
interface Growth {
  newUsers: number;
  newRegistrations: number;
  registrants: number;
  attendance: { eventsWithRegistrations: number; reports: number; registered: number; attended: number; percent: number | null; repeatAttendees: number; attendees: number };
  turnoutBy: { city: TurnoutRow[]; category: TurnoutRow[]; organizer: TurnoutRow[] };
  sources: { source: string; events: number; views: number; saves: number; registrations: number; ticketClicks: number }[];
  organizerFunnel: {
    organizers: number;
    organizersPublished: number;
    created: number;
    published: number;
    abandoned: number;
    missing: { date: number; place: number; category: number; cover: number; description: number };
  };
  notificationsByType: { type: string; sent: number; read: number; readPercent: number }[];
  organizerFeedback: { eventTitle: string; comment: string; submittedAt: string }[];
}

interface Section {
  id: string;
  title: string;
  hint?: string;
  rows: { key: string; label: string; value: string }[];
}

const pct = (part: number, whole: number) => (whole > 0 ? ` (${Math.round((part / whole) * 100)}%)` : "");

/** New accounts, registrations, real turnout, organizer funnel, listing sources and notification reads for the chosen period (the app's "growth" block). */
export function AdminGrowth({ period }: { period: Period }) {
  const { t, locale } = useTranslations();
  const [data, setData] = useState<Growth | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      setData(null);
      setFailed(false);
    });
    (async () => {
      const res = await fetch(`/api/v1/admin/analytics/growth?${periodQuery(period)}`, { headers: { Authorization: `Bearer ${getAccessToken() ?? ""}` } }).catch(() => null);
      if (cancelled) return;
      if (res?.ok) setData((await res.json()) as Growth);
      else setFailed(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [period]);

  if (failed) return <p className="mb-8 text-sm text-danger">{t("common.somethingWentWrong")}</p>;
  if (!data) return <Spinner />;

  const g = (k: string) => t(`admin.growth.${k}`);
  const named = (group: string, key: string) => {
    const label = t(`admin.growth.${group}.${key}`);
    return label === `admin.growth.${group}.${key}` ? key : label;
  };
  const a = data.attendance;
  const f = data.organizerFunnel;
  const turnout = (rows: TurnoutRow[]) => rows.map((r) => ({ key: r.name, label: r.name, value: `${r.attended}/${r.registered}${r.percent === null ? "" : ` · ${r.percent}%`}` }));

  const sections: Section[] = [
    {
      id: "sources",
      title: g("sourcesTitle"),
      hint: g("sourcesHint"),
      rows: data.sources.map((s) => ({ key: s.source, label: named("sourceNames", s.source), value: `${s.events} · ${s.views} · ${s.saves} · ${s.registrations} · ${s.ticketClicks}` })),
    },
    {
      id: "funnel",
      title: g("funnelTitle"),
      hint: g("funnelHint"),
      rows: [
        { key: "o", label: g("funnelOrganizers"), value: String(f.organizers) },
        { key: "op", label: g("funnelOrganizersPublished"), value: `${f.organizersPublished}${pct(f.organizersPublished, f.organizers)}` },
        { key: "c", label: g("funnelCreated"), value: String(f.created) },
        { key: "p", label: g("funnelPublished"), value: `${f.published}${pct(f.published, f.created)}` },
        { key: "a", label: g("funnelAbandoned"), value: `${f.abandoned}${pct(f.abandoned, f.created)}` },
        { key: "md", label: g("missingDate"), value: String(f.missing.date) },
        { key: "mp", label: g("missingPlace"), value: String(f.missing.place) },
        { key: "mc", label: g("missingCategory"), value: String(f.missing.category) },
        { key: "mv", label: g("missingCover"), value: String(f.missing.cover) },
        { key: "mt", label: g("missingDescription"), value: String(f.missing.description) },
      ],
    },
    { id: "turnoutCity", title: g("turnoutCity"), hint: g("turnoutHint"), rows: turnout(data.turnoutBy.city) },
    { id: "turnoutCategory", title: g("turnoutCategory"), hint: g("turnoutHint"), rows: turnout(data.turnoutBy.category) },
    { id: "turnoutOrganizer", title: g("turnoutOrganizer"), hint: g("turnoutHint"), rows: turnout(data.turnoutBy.organizer) },
    {
      id: "notifications",
      title: g("notifTitle"),
      hint: g("notifHint"),
      rows: data.notificationsByType.map((n) => ({ key: n.type, label: named("notifNames", n.type), value: `${n.sent} · ${n.read} (${n.readPercent}%)` })),
    },
  ];

  const tile = (label: string, value: string, sub?: string) => (
    <div key={label} className="rounded-xl bg-surface p-3 text-center">
      <p className="text-[22px] font-extrabold">{value}</p>
      <p className="text-[11px] text-muted">{label}</p>
      {sub && <p className="text-[10px] text-muted">{sub}</p>}
    </div>
  );

  return (
    <div className="mb-8 flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {tile(g("newUsers"), String(data.newUsers))}
        {tile(g("newRegistrations"), String(data.newRegistrations), g("people").replace("{n}", String(data.registrants)))}
        {tile(g("turnout"), a.percent === null ? "—" : `${a.percent}%`, a.percent === null ? g("noReports") : g("turnoutOf").replace("{attended}", String(a.attended)).replace("{registered}", String(a.registered)))}
        {tile(g("reports"), `${a.reports}/${a.eventsWithRegistrations}`, g("reportsHint"))}
        {tile(g("repeat"), a.attendees === 0 ? "—" : `${a.repeatAttendees}/${a.attendees}`, g("repeatHint"))}
      </div>

      {sections.map((s) => (
        <section key={s.id} className="flex flex-col gap-1 rounded-xl bg-surface p-3">
          <h3 className="text-sm font-bold">{s.title}</h3>
          {s.hint && <p className="text-xs text-muted">{s.hint}</p>}
          {s.rows.length === 0 && <p className="text-xs text-muted">{g("empty")}</p>}
          {s.rows.map((r) => (
            <div key={r.key} className="flex items-center justify-between gap-3 py-0.5 text-[13px]">
              <span className="truncate">{r.label}</span>
              <span className="shrink-0 text-xs text-muted">{r.value}</span>
            </div>
          ))}
        </section>
      ))}

      <section className="flex flex-col gap-2 rounded-xl bg-surface p-3">
        <h3 className="text-sm font-bold">{g("feedbackTitle")}</h3>
        {data.organizerFeedback.length === 0 && <p className="text-xs text-muted">{g("feedbackEmpty")}</p>}
        {data.organizerFeedback.map((fb) => (
          <div key={`${fb.submittedAt}-${fb.eventTitle}`} className="flex flex-col gap-0.5 border-t border-border pt-2">
            <p className="text-xs text-muted">
              {fb.eventTitle} · {formatDateTime(fb.submittedAt, locale)}
            </p>
            <p className="text-[13px]">{fb.comment}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
