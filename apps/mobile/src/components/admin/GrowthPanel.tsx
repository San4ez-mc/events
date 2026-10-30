import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { API_URL, getAccessToken } from "../../lib/api-client";
import { useTranslations } from "../../lib/locale-context";
import { radius, spacing, type Palette, useThemedStyles } from "../../lib/theme";
import { AdminLoader } from "./AdminLoader";
import { periodQuery, type Period } from "./PeriodFilter";

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

/** New accounts, registrations, real turnout, organizer funnel, listing sources and notification reads for the chosen period (all from our database). */
export function GrowthPanel({ period, refreshKey = 0 }: { period: Period; refreshKey?: number }) {
  const { styles } = useThemedStyles(makeStyles);
  const { t } = useTranslations();
  const [data, setData] = useState<Growth | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setData(null);
    setFailed(false);
    void (async () => {
      try {
        const res = await fetch(`${API_URL}/api/v1/admin/analytics/growth?${periodQuery(period)}`, { headers: { Authorization: `Bearer ${getAccessToken() ?? ""}` } });
        if (res.ok) setData((await res.json()) as Growth);
        else setFailed(true);
      } catch {
        setFailed(true);
      }
    })();
  }, [refreshKey, period.from, period.to]);

  if (failed) return <Text style={styles.error}>{t("common.somethingWentWrong")}</Text>;
  if (!data) return <AdminLoader />;

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

  return (
    <View style={{ gap: spacing.md }}>
      <View style={styles.tiles}>
        <Tile label={g("newUsers")} value={String(data.newUsers)} />
        <Tile label={g("newRegistrations")} value={String(data.newRegistrations)} sub={g("people").replace("{n}", String(data.registrants))} />
        <Tile label={g("turnout")} value={a.percent === null ? "—" : `${a.percent}%`} sub={a.percent === null ? g("noReports") : g("turnoutOf").replace("{attended}", String(a.attended)).replace("{registered}", String(a.registered))} />
        <Tile label={g("reports")} value={`${a.reports}/${a.eventsWithRegistrations}`} sub={g("reportsHint")} />
        <Tile label={g("repeat")} value={a.attendees === 0 ? "—" : `${a.repeatAttendees}/${a.attendees}`} sub={g("repeatHint")} />
      </View>

      {sections.map((s) => (
        <View key={s.id} style={styles.card}>
          <Text style={styles.title}>{s.title}</Text>
          {s.hint ? <Text style={styles.muted}>{s.hint}</Text> : null}
          {s.rows.length === 0 && <Text style={styles.muted}>{g("empty")}</Text>}
          {s.rows.map((r) => (
            <View key={r.key} style={styles.row}>
              <Text style={styles.rowLabel} numberOfLines={1}>
                {r.label}
              </Text>
              <Text style={styles.muted}>{r.value}</Text>
            </View>
          ))}
        </View>
      ))}

      <View style={styles.card}>
        <Text style={styles.title}>{g("feedbackTitle")}</Text>
        {data.organizerFeedback.length === 0 && <Text style={styles.muted}>{g("feedbackEmpty")}</Text>}
        {data.organizerFeedback.map((fb) => (
          <View key={`${fb.submittedAt}-${fb.eventTitle}`} style={styles.feedback}>
            <Text style={styles.muted}>
              {fb.eventTitle} · {new Date(fb.submittedAt).toLocaleDateString()}
            </Text>
            <Text style={styles.body} selectable>
              {fb.comment}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );

  function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
    return (
      <View style={styles.tile}>
        <Text style={styles.tileValue}>{value}</Text>
        <Text style={styles.tileLabel}>{label}</Text>
        {sub ? <Text style={styles.tileSub}>{sub}</Text> : null}
      </View>
    );
  }
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    muted: { color: colors.muted, fontSize: 12 },
    error: { color: colors.danger, fontSize: 13 },
    body: { color: colors.foreground, fontSize: 13 },
    tiles: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
    tile: { width: "48%", flexGrow: 1, backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, alignItems: "center" },
    tileValue: { color: colors.foreground, fontSize: 22, fontWeight: "800" },
    tileLabel: { color: colors.muted, fontSize: 11, textAlign: "center", marginTop: 2 },
    tileSub: { color: colors.muted, fontSize: 10, textAlign: "center", marginTop: 2 },
    card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, gap: spacing.xs },
    title: { color: colors.foreground, fontSize: 14, fontWeight: "700" },
    row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.md, paddingVertical: 3 },
    rowLabel: { color: colors.foreground, fontSize: 13, flex: 1 },
    feedback: { gap: 2, paddingTop: spacing.xs, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  });
