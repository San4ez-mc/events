import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { API_URL, getAccessToken } from "../../lib/api-client";
import { useTranslations } from "../../lib/locale-context";
import { radius, spacing, type Palette, useThemedStyles } from "../../lib/theme";

interface TrafficReport {
  configured: boolean;
  days: number;
  totals?: { visitors: number; views: number; sessions: number; avgSessionSeconds: number };
  daily?: { date: string; visitors: number; views: number }[];
  topPages?: { page: string; views: number; visitors: number; avgSeconds: number | null }[];
  platforms?: { platform: string; visitors: number; avgSessionSeconds: number | null }[];
  referrers?: { source: string; visitors: number }[];
  webOs?: { os: string; visitors: number }[];
  error?: string;
}

const DAYS = 30;

/** 95 → "1:35", 3700 → "1:01:40". */
function formatDuration(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/** Site + app visitors from PostHog, via the API's /admin/analytics/traffic (the personal API key stays on the server). */
export function TrafficPanel() {
  const { colors, styles } = useThemedStyles(makeStyles);
  const { t } = useTranslations();
  const [report, setReport] = useState<TrafficReport | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch(`${API_URL}/api/v1/admin/analytics/traffic?days=${DAYS}`, { headers: { Authorization: `Bearer ${getAccessToken() ?? ""}` } });
        setReport(res.ok ? ((await res.json()) as TrafficReport) : { configured: true, days: DAYS, error: "TRAFFIC_UNAVAILABLE" });
      } catch {
        setReport({ configured: true, days: DAYS, error: "TRAFFIC_UNAVAILABLE" });
      }
    })();
  }, []);

  if (report === null) return <ActivityIndicator color={colors.accentFrom} />;
  if (!report.configured) return <Text style={styles.muted}>{t("admin.traffic.notConfigured")}</Text>;
  if (report.error || !report.totals) return <Text style={styles.error}>{t("admin.traffic.unavailable")}</Text>;

  const maxVisitors = Math.max(1, ...(report.daily ?? []).map((d) => d.visitors));

  return (
    <View style={{ gap: spacing.md }}>
      <Text style={styles.muted}>{t("admin.traffic.period").replace("{days}", String(DAYS))}</Text>
      <View style={styles.tiles}>
        <Tile label={t("admin.traffic.visitors")} value={String(report.totals.visitors)} />
        <Tile label={t("admin.traffic.views")} value={String(report.totals.views)} />
        <Tile label={t("admin.traffic.sessions")} value={String(report.totals.sessions)} />
        <Tile label={t("admin.traffic.avgSession")} value={formatDuration(report.totals.avgSessionSeconds)} />
      </View>

      {report.daily && report.daily.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.title}>{t("admin.traffic.daily")}</Text>
          <View style={styles.bars}>
            {report.daily.map((d) => (
              <View key={d.date} style={[styles.bar, { height: `${Math.max(2, (d.visitors / maxVisitors) * 100)}%` }]} />
            ))}
          </View>
        </View>
      )}

      <Section
        title={t("admin.traffic.topPages")}
        hint={t("admin.traffic.topPagesHint")}
        empty={t("admin.traffic.empty")}
        rows={(report.topPages ?? []).map((p) => ({ key: p.page, label: p.page, value: `${p.views} · ${p.visitors}${p.avgSeconds !== null ? ` · ${formatDuration(p.avgSeconds)}` : ""}` }))}
      />
      <Section
        title={t("admin.traffic.platforms")}
        hint={t("admin.traffic.platformsHint")}
        empty={t("admin.traffic.empty")}
        rows={(report.platforms ?? []).map((p) => ({ key: p.platform, label: p.platform, value: `${p.visitors}${p.avgSessionSeconds !== null ? ` · ${formatDuration(p.avgSessionSeconds)}` : ""}` }))}
      />
      <Section
        title={t("admin.traffic.webOs")}
        hint={t("admin.traffic.webOsHint")}
        empty={t("admin.traffic.empty")}
        rows={(report.webOs ?? []).map((o) => ({ key: o.os, label: o.os, value: String(o.visitors) }))}
      />
      <Section
        title={t("admin.traffic.sources")}
        empty={t("admin.traffic.empty")}
        rows={(report.referrers ?? []).map((r) => ({ key: r.source, label: r.source === "$direct" ? t("admin.traffic.direct") : r.source, value: String(r.visitors) }))}
      />
    </View>
  );

  function Tile({ label, value }: { label: string; value: string }) {
    return (
      <View style={styles.tile}>
        <Text style={styles.tileValue}>{value}</Text>
        <Text style={styles.tileLabel}>{label}</Text>
      </View>
    );
  }

  function Section({ title, hint, rows, empty }: { title: string; hint?: string; rows: { key: string; label: string; value: string }[]; empty: string }) {
    return (
      <View style={styles.card}>
        <Text style={styles.title}>{title}</Text>
        {hint ? <Text style={styles.muted}>{hint}</Text> : null}
        {rows.length === 0 && <Text style={styles.muted}>{empty}</Text>}
        {rows.map((r) => (
          <View key={r.key} style={styles.row}>
            <Text style={styles.rowLabel} numberOfLines={1}>
              {r.label}
            </Text>
            <Text style={styles.muted}>{r.value}</Text>
          </View>
        ))}
      </View>
    );
  }
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  muted: { color: colors.muted, fontSize: 12 },
  error: { color: colors.danger, fontSize: 13 },
  tiles: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  tile: { width: "48%", flexGrow: 1, backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, alignItems: "center" },
  tileValue: { color: colors.foreground, fontSize: 22, fontWeight: "800" },
  tileLabel: { color: colors.muted, fontSize: 11, textAlign: "center", marginTop: 2 },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, gap: spacing.xs },
  title: { color: colors.foreground, fontSize: 14, fontWeight: "700" },
  bars: { flexDirection: "row", alignItems: "flex-end", gap: 2, height: 80, marginTop: spacing.sm },
  bar: { flex: 1, backgroundColor: colors.accentFrom, borderTopLeftRadius: 2, borderTopRightRadius: 2, minHeight: 2 },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.md, paddingVertical: 3 },
  rowLabel: { color: colors.foreground, fontSize: 13, flex: 1 },
});
