import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { API_URL, getAccessToken } from "../../lib/api-client";
import { useTranslations } from "../../lib/locale-context";
import { radius, spacing, type Palette, useThemedStyles } from "../../lib/theme";
import { AdminLoader } from "./AdminLoader";
import { periodQuery, type Period } from "./PeriodFilter";

interface Growth {
  newUsers: number;
  newRegistrations: number;
  registrants: number;
  attendance: { eventsWithRegistrations: number; reports: number; registered: number; attended: number; percent: number | null };
  organizerFeedback: { eventTitle: string; comment: string; submittedAt: string }[];
}

/** New accounts, new event registrations, real turnout (from the organizers' post-event reports) and their wishes, for the chosen period. */
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

  const a = data.attendance;
  return (
    <View style={{ gap: spacing.md }}>
      <View style={styles.tiles}>
        <Tile label={t("admin.growth.newUsers")} value={String(data.newUsers)} />
        <Tile label={t("admin.growth.newRegistrations")} value={String(data.newRegistrations)} sub={t("admin.growth.people").replace("{n}", String(data.registrants))} />
        <Tile label={t("admin.growth.turnout")} value={a.percent === null ? "—" : `${a.percent}%`} sub={a.percent === null ? t("admin.growth.noReports") : t("admin.growth.turnoutOf").replace("{attended}", String(a.attended)).replace("{registered}", String(a.registered))} />
        <Tile label={t("admin.growth.reports")} value={`${a.reports}/${a.eventsWithRegistrations}`} sub={t("admin.growth.reportsHint")} />
      </View>

      <View style={styles.card}>
        <Text style={styles.title}>{t("admin.growth.feedbackTitle")}</Text>
        {data.organizerFeedback.length === 0 && <Text style={styles.muted}>{t("admin.growth.feedbackEmpty")}</Text>}
        {data.organizerFeedback.map((f) => (
          <View key={`${f.submittedAt}-${f.eventTitle}`} style={styles.feedback}>
            <Text style={styles.muted}>
              {f.eventTitle} · {new Date(f.submittedAt).toLocaleDateString()}
            </Text>
            <Text style={styles.body} selectable>
              {f.comment}
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
    card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, gap: spacing.sm },
    title: { color: colors.foreground, fontSize: 14, fontWeight: "700" },
    feedback: { gap: 2, paddingTop: spacing.xs, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  });
