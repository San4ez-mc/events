import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { API_URL, getAccessToken } from "../../lib/api-client";
import { useTranslations } from "../../lib/locale-context";
import { radius, spacing, type Palette, useThemedStyles } from "../../lib/theme";
import { AdminLoader } from "./AdminLoader";
import { periodQuery, type Period } from "./PeriodFilter";

interface TrafficDaily {
  configured: boolean;
  daily?: { date: string; visitors: number; views: number }[];
}
interface Daily {
  days: string[];
  series: {
    newUsers: number[];
    registrations: number[];
    placementsApp: number[];
    placementsImported: number[];
    eventViews: number[];
    saves: number[];
    ticketClicks: number[];
    shares: number[];
  };
}

const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);
/** "2026-10-28" -> "28.10". */
const short = (day: string) => `${Number(day.slice(8))}.${day.slice(5, 7)}`;

/**
 * The charts people open the admin for, kept at the very top: visitors per day first (the one looked at most), then page
 * views, new accounts, listings placed, event views, ticket clicks and registrations. Visitors and views come from PostHog
 * (the same cached report as the traffic block), everything else from our database.
 */
export function DailyCharts({ period, refreshKey = 0 }: { period: Period; refreshKey?: number }) {
  const { styles } = useThemedStyles(makeStyles);
  const { t } = useTranslations();
  const [traffic, setTraffic] = useState<TrafficDaily | null>(null);
  const [daily, setDaily] = useState<Daily | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setTraffic(null);
    setDaily(null);
    setFailed(false);
    const headers = { Authorization: `Bearer ${getAccessToken() ?? ""}` };
    const query = periodQuery(period);
    void (async () => {
      const [trafficRes, dailyRes] = await Promise.all([
        fetch(`${API_URL}/api/v1/admin/analytics/traffic?${query}`, { headers }).catch(() => null),
        fetch(`${API_URL}/api/v1/admin/analytics/daily?${query}`, { headers }).catch(() => null),
      ]);
      setTraffic(trafficRes?.ok ? ((await trafficRes.json()) as TrafficDaily) : { configured: false });
      if (dailyRes?.ok) setDaily((await dailyRes.json()) as Daily);
      else setFailed(true);
    })();
  }, [refreshKey, period.from, period.to]);

  if (failed) return <Text style={styles.error}>{t("common.somethingWentWrong")}</Text>;
  if (!daily || !traffic) return <AdminLoader />;

  const byDate = new Map((traffic.daily ?? []).map((d) => [d.date, d]));
  const visitors = daily.days.map((d) => byDate.get(d)?.visitors ?? 0);
  const views = daily.days.map((d) => byDate.get(d)?.views ?? 0);
  const s = daily.series;
  const d = (key: string) => t(`admin.daily.${key}`);

  return (
    <View style={{ gap: spacing.md }}>
      <Chart title={d("visitors")} hint={traffic.configured ? undefined : t("admin.traffic.notConfigured")} values={visitors} days={daily.days} tall />
      <View style={styles.grid}>
        <Chart title={d("views")} values={views} days={daily.days} />
        <Chart title={d("newUsers")} values={s.newUsers} days={daily.days} />
        <Chart title={d("placements")} values={s.placementsApp} extra={s.placementsImported} legend={[d("placementsApp"), d("placementsImported")]} days={daily.days} />
        <Chart title={d("eventViews")} values={s.eventViews} days={daily.days} />
        <Chart title={d("ticketClicks")} values={s.ticketClicks} days={daily.days} />
        <Chart title={d("registrations")} values={s.registrations} days={daily.days} />
        <Chart title={d("saves")} values={s.saves} days={daily.days} />
        <Chart title={d("shares")} values={s.shares} days={daily.days} />
      </View>
    </View>
  );

  function Chart({ title, hint, values, extra, legend, days, tall }: { title: string; hint?: string; values: number[]; extra?: number[]; legend?: string[]; days: string[]; tall?: boolean }) {
    const totals = values.map((v, i) => v + (extra?.[i] ?? 0));
    const max = Math.max(1, ...totals);
    const total = sum(totals);
    return (
      <View style={[styles.card, !tall && styles.cardHalf]}>
        <View style={styles.headRow}>
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
          <Text style={tall ? styles.totalBig : styles.total}>{total}</Text>
        </View>
        <View style={[styles.bars, { height: tall ? 110 : 56 }]} accessibilityRole="image" accessibilityLabel={`${title}: ${total}`}>
          {days.map((day, i) => {
            const main = values[i] ?? 0;
            const top = extra?.[i] ?? 0;
            return (
              <View key={day} style={styles.barColumn}>
                {top > 0 && <View style={[styles.bar, styles.barExtra, { height: `${(top / max) * 100}%` }]} />}
                <View style={[styles.bar, { height: main > 0 ? `${Math.max(3, (main / max) * 100)}%` : 2, opacity: main > 0 ? 1 : 0.25 }]} />
              </View>
            );
          })}
        </View>
        <View style={styles.headRow}>
          <Text style={styles.axis}>{short(days[0] ?? "")}</Text>
          <Text style={styles.axis}>{`max ${max === 1 && total === 0 ? 0 : max}`}</Text>
          <Text style={styles.axis}>{short(days[days.length - 1] ?? "")}</Text>
        </View>
        {legend ? (
          <View style={styles.legend}>
            <View style={styles.legendItem}>
              <View style={[styles.dot, styles.dotMain]} />
              <Text style={styles.axis}>{legend[0]}</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.dot, styles.barExtra]} />
              <Text style={styles.axis}>{legend[1]}</Text>
            </View>
          </View>
        ) : null}
        {hint ? <Text style={styles.axis}>{hint}</Text> : null}
      </View>
    );
  }
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    error: { color: colors.danger, fontSize: 13 },
    grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
    card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, gap: spacing.xs },
    cardHalf: { width: "48.5%", flexGrow: 1 },
    headRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
    title: { color: colors.foreground, fontSize: 13, fontWeight: "700", flexShrink: 1 },
    total: { color: colors.foreground, fontSize: 15, fontWeight: "800" },
    totalBig: { color: colors.foreground, fontSize: 22, fontWeight: "800" },
    bars: { flexDirection: "row", alignItems: "flex-end", gap: 1, marginTop: spacing.xs },
    barColumn: { flex: 1, height: "100%", justifyContent: "flex-end" },
    bar: { width: "100%", backgroundColor: colors.accentFrom, borderTopLeftRadius: 2, borderTopRightRadius: 2, minHeight: 2 },
    barExtra: { backgroundColor: colors.accentTo, borderRadius: 0 },
    axis: { color: colors.muted, fontSize: 10 },
    legend: { flexDirection: "row", gap: spacing.md, flexWrap: "wrap" },
    legendItem: { flexDirection: "row", alignItems: "center", gap: 4 },
    dot: { width: 8, height: 8, borderRadius: 4 },
    dotMain: { backgroundColor: colors.accentFrom },
  });
