import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { radius, spacing, type Palette, useThemedStyles } from "../../lib/theme";

const pad = (n: number) => String(n).padStart(2, "0");
const key = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;

/**
 * Month-grid date picker for the "specific date" / "date range" filter presets (RN has no native date input,
 * unlike the web filters' <input type="date">). Dates are yyyy-mm-dd strings, exactly the shape
 * DiscoveryFilters.dateFrom/dateTo already use. Range mode: first tap sets the start, the next later tap sets
 * the end; tapping earlier than the start (or after a finished range) starts over.
 */
export function CalendarPicker({
  mode,
  from,
  to,
  onChange,
  locale,
}: {
  mode: "date" | "range";
  from: string;
  to: string;
  onChange: (next: { from: string; to: string }) => void;
  locale: string;
}) {
  const { colors, styles } = useThemedStyles(makeStyles);
  const today = new Date();
  const seed = /^(\d{4})-(\d{2})-/.exec(from);
  const [view, setView] = useState({ y: seed ? Number(seed[1]) : today.getFullYear(), m: seed ? Number(seed[2]) - 1 : today.getMonth() });

  const tag = locale === "uk" ? "uk-UA" : "en-US";
  const title = new Date(view.y, view.m, 1).toLocaleDateString(tag, { month: "long", year: "numeric" });
  // 2024-01-01 is a Monday, so this yields Mon..Sun in the user's language.
  const weekdays = useMemo(() => Array.from({ length: 7 }, (_, i) => new Date(2024, 0, 1 + i).toLocaleDateString(tag, { weekday: "short" })), [tag]);

  const firstOffset = (new Date(view.y, view.m, 1).getDay() + 6) % 7; // Monday-first
  const daysInMonth = new Date(view.y, view.m + 1, 0).getDate();
  const cells: (number | null)[] = [...Array(firstOffset).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  const todayKey = key(today.getFullYear(), today.getMonth(), today.getDate());

  function shift(delta: number) {
    setView((v) => {
      const d = new Date(v.y, v.m + delta, 1);
      return { y: d.getFullYear(), m: d.getMonth() };
    });
  }

  function pick(d: number) {
    const k = key(view.y, view.m, d);
    if (mode === "date") return onChange({ from: k, to: "" });
    if (!from || (from && to) || k < from) return onChange({ from: k, to: "" });
    onChange({ from, to: k });
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Pressable onPress={() => shift(-1)} hitSlop={10} accessibilityLabel="Previous month">
          <Ionicons name="chevron-back" size={20} color={colors.foreground} />
        </Pressable>
        <Text style={styles.title}>{title}</Text>
        <Pressable onPress={() => shift(1)} hitSlop={10} accessibilityLabel="Next month">
          <Ionicons name="chevron-forward" size={20} color={colors.foreground} />
        </Pressable>
      </View>
      <View style={styles.row}>
        {weekdays.map((w, i) => (
          <Text key={i} style={styles.weekday}>
            {w}
          </Text>
        ))}
      </View>
      <View style={styles.grid}>
        {cells.map((d, i) => {
          if (d === null) return <View key={`b${i}`} style={styles.cell} />;
          const k = key(view.y, view.m, d);
          const isEdge = k === from || (mode === "range" && k === to);
          const inside = mode === "range" && !!from && !!to && k > from && k < to;
          return (
            <Pressable key={k} style={styles.cell} onPress={() => pick(d)} accessibilityState={{ selected: isEdge }}>
              <View style={[styles.day, inside && styles.dayInside, isEdge && styles.dayEdge, k === todayKey && !isEdge && styles.dayToday]}>
                <Text style={[styles.dayText, isEdge && styles.dayTextEdge]}>{d}</Text>
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  wrap: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.md, gap: spacing.sm },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  title: { color: colors.foreground, fontSize: 15, fontWeight: "700", textTransform: "capitalize" },
  row: { flexDirection: "row" },
  weekday: { flex: 1, textAlign: "center", color: colors.muted, fontSize: 11, fontWeight: "600", textTransform: "capitalize" },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  cell: { width: `${100 / 7}%`, aspectRatio: 1, alignItems: "center", justifyContent: "center" },
  day: { width: "84%", aspectRatio: 1, borderRadius: 999, alignItems: "center", justifyContent: "center" },
  dayInside: { backgroundColor: "rgba(139,92,246,0.25)" },
  dayEdge: { backgroundColor: colors.accentFrom },
  dayToday: { borderWidth: 1, borderColor: colors.accentFrom },
  dayText: { color: colors.foreground, fontSize: 13 },
  dayTextEdge: { color: colors.white, fontWeight: "800" },
});
