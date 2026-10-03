import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { API_URL, getAccessToken } from "../../lib/api-client";
import { useTranslations } from "../../lib/locale-context";
import { radius, spacing, type Palette, useThemedStyles } from "../../lib/theme";

interface Insights {
  posthogConfigured: boolean;
  posthogError?: boolean;
  eventFunnel?: { views: number; registrationStarted: number; registered: number };
  creationFunnel?: { step1: number; step2: number; step3: number; published: number };
  activation?: { signups: number; activated24h: number; avgMinutesToFirstAction: number | null };
  retention?: { cohort: number; d1: number; d7: number };
  swipes?: { right: number; left: number };
  searches?: { top: { query: string; count: number }[]; noResults: { query: string; count: number }[] };
  supplyDemand: { category: string; events: number; views: number; saves: number; registrations: number }[];
  supplyDemandByCity: { city: string; events: number; views: number; saves: number; registrations: number }[];
  payments: { provider: string; created: number; paid: number }[];
  referrals: { pending: number; approved: number; rejected: number };
  notifications: { channel: string; status: string; count: number }[];
}

interface Row {
  key: string;
  label: string;
  value: string;
}
interface Section {
  id: string;
  title: string;
  hint?: string;
  rows: Row[];
}

const DAYS = 30;
const pct = (part: number, whole: number) => (whole > 0 ? ` (${Math.round((part / whole) * 100)}%)` : "");

/** Funnels, activation, retention, search terms (PostHog) and supply/demand, payments, referrals, delivery (our DB) — mobile twin of the web admin block. */
export function InsightsPanel() {
  const { styles } = useThemedStyles(makeStyles);
  const { t } = useTranslations();
  const [data, setData] = useState<Insights | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch(`${API_URL}/api/v1/admin/analytics/insights?days=${DAYS}`, { headers: { Authorization: `Bearer ${getAccessToken() ?? ""}` } });
        if (res.ok) setData((await res.json()) as Insights);
        else setFailed(true);
      } catch {
        setFailed(true);
      }
    })();
  }, []);

  if (failed) return <Text style={styles.error}>{t("common.somethingWentWrong")}</Text>;
  if (!data) return null;

  const i = (k: string) => t(`admin.insights.${k}`);
  const provider = (p: string) => {
    const label = t(`enums.provider.${p}`);
    return label === `enums.provider.${p}` ? p : label;
  };
  const sections: Section[] = [];

  if (data.eventFunnel) {
    const f = data.eventFunnel;
    sections.push({
      id: "eventFunnel",
      title: i("eventFunnel"),
      rows: [
        { key: "v", label: i("viewed"), value: String(f.views) },
        { key: "s", label: i("started"), value: `${f.registrationStarted}${pct(f.registrationStarted, f.views)}` },
        { key: "r", label: i("registered"), value: `${f.registered}${pct(f.registered, f.registrationStarted)}` },
      ],
    });
  }
  if (data.creationFunnel) {
    const f = data.creationFunnel;
    sections.push({
      id: "creationFunnel",
      title: i("creationFunnel"),
      rows: [
        { key: "1", label: i("step1"), value: String(f.step1) },
        { key: "2", label: i("step2"), value: `${f.step2}${pct(f.step2, f.step1)}` },
        { key: "3", label: i("step3"), value: `${f.step3}${pct(f.step3, f.step2)}` },
        { key: "p", label: i("published"), value: `${f.published}${pct(f.published, f.step3)}` },
      ],
    });
  }
  if (data.activation) {
    const a = data.activation;
    sections.push({
      id: "activation",
      title: i("activation"),
      rows: [
        { key: "s", label: i("signups"), value: String(a.signups) },
        { key: "a", label: i("activated"), value: `${a.activated24h}${pct(a.activated24h, a.signups)}` },
        { key: "t", label: i("avgFirstAction"), value: a.avgMinutesToFirstAction === null ? "—" : `${a.avgMinutesToFirstAction} ${i("minutes")}` },
      ],
    });
  }
  if (data.retention) {
    const r = data.retention;
    sections.push({
      id: "retention",
      title: i("retention"),
      rows: [
        { key: "c", label: i("cohort"), value: String(r.cohort) },
        { key: "d1", label: i("d1"), value: `${r.d1}${pct(r.d1, r.cohort)}` },
        { key: "d7", label: i("d7"), value: `${r.d7}${pct(r.d7, r.cohort)}` },
      ],
    });
  }
  if (data.swipes) {
    const total = data.swipes.right + data.swipes.left;
    sections.push({
      id: "swipes",
      title: i("swipes"),
      rows: [
        { key: "r", label: i("swipeRight"), value: `${data.swipes.right}${pct(data.swipes.right, total)}` },
        { key: "l", label: i("swipeLeft"), value: `${data.swipes.left}${pct(data.swipes.left, total)}` },
      ],
    });
  }
  if (data.searches) {
    sections.push({ id: "searchTop", title: i("searchTop"), rows: data.searches.top.map((s) => ({ key: s.query, label: s.query, value: String(s.count) })) });
    sections.push({ id: "searchNone", title: i("searchNone"), rows: data.searches.noResults.map((s) => ({ key: s.query, label: s.query, value: String(s.count) })) });
  }
  const sd = (r: { events: number; views: number; saves: number; registrations: number }) => `${r.events} · ${r.views} · ${r.saves} · ${r.registrations}`;
  sections.push({ id: "supplyCategory", title: i("supplyCategory"), hint: i("supplyHint"), rows: data.supplyDemand.map((r) => ({ key: r.category, label: r.category, value: sd(r) })) });
  sections.push({ id: "supplyCity", title: i("supplyCity"), hint: i("supplyHint"), rows: data.supplyDemandByCity.map((r) => ({ key: r.city, label: r.city, value: sd(r) })) });
  sections.push({
    id: "payments",
    title: i("payments"),
    rows: data.payments.map((p) => ({ key: p.provider, label: provider(p.provider), value: i("paymentsRow").replace("{created}", String(p.created)).replace("{paid}", `${p.paid}${pct(p.paid, p.created)}`) })),
  });
  sections.push({
    id: "referrals",
    title: i("referrals"),
    rows: [
      { key: "p", label: i("pending"), value: String(data.referrals.pending) },
      { key: "a", label: i("approved"), value: String(data.referrals.approved) },
      { key: "r", label: i("rejected"), value: String(data.referrals.rejected) },
    ],
  });
  sections.push({
    id: "notifications",
    title: i("notifications"),
    hint: i("notificationsHint"),
    rows: data.notifications.map((n) => ({ key: `${n.channel}:${n.status}`, label: `${n.channel} · ${n.status}`, value: String(n.count) })),
  });

  return (
    <View style={{ gap: spacing.md }}>
      <Text style={styles.heading}>{i("title")}</Text>
      {!data.posthogConfigured && <Text style={styles.muted}>{i("needPosthog")}</Text>}
      {data.posthogError && <Text style={styles.error}>{i("posthogError")}</Text>}
      {sections.map((s) => (
        <View key={s.id} style={styles.card}>
          <Text style={styles.title}>{s.title}</Text>
          {s.hint ? <Text style={styles.muted}>{s.hint}</Text> : null}
          {s.rows.length === 0 && <Text style={styles.muted}>{i("empty")}</Text>}
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
    </View>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  heading: { color: colors.foreground, fontSize: 16, fontWeight: "800", marginTop: spacing.md },
  muted: { color: colors.muted, fontSize: 12 },
  error: { color: colors.danger, fontSize: 13 },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, gap: spacing.xs },
  title: { color: colors.foreground, fontSize: 14, fontWeight: "700" },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.md, paddingVertical: 3 },
  rowLabel: { color: colors.foreground, fontSize: 13, flex: 1 },
});
