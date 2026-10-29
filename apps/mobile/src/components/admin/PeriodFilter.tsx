import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useTranslations } from "../../lib/locale-context";
import { radius, spacing, type Palette, useThemedStyles } from "../../lib/theme";
import { CalendarPicker } from "../discover/CalendarPicker";

/** Whole days, both ends included (yyyy-mm-dd, the phone's local day = Kyiv for our admins). */
export interface Period {
  from: string;
  to: string;
}

export type PeriodPreset = "day" | "week" | "month" | "custom";

const pad = (n: number) => String(n).padStart(2, "0");
const dayKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export function presetPeriod(preset: Exclude<PeriodPreset, "custom">): Period {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - (preset === "day" ? 0 : preset === "week" ? 6 : 29));
  return { from: dayKey(from), to: dayKey(to) };
}

/** Query string for the admin analytics endpoints. */
export const periodQuery = (p: Period): string => `from=${p.from}&to=${p.to}`;

/** "28.10 – 3.11" / "28.10". */
function formatPeriod(p: Period): string {
  const short = (k: string) => `${Number(k.slice(8))}.${k.slice(5, 7)}`;
  return p.from === p.to ? short(p.from) : `${short(p.from)} – ${short(p.to)}`;
}

/** Day / week / month / any dates, for the admin analytics block. Controlled: the parent owns the period. */
export function PeriodFilter({ period, onChange }: { period: Period; onChange: (next: Period) => void }) {
  const { styles } = useThemedStyles(makeStyles);
  const { t, locale } = useTranslations();
  const [preset, setPreset] = useState<PeriodPreset>("month");
  const [draft, setDraft] = useState<Period>({ from: "", to: "" });

  function choose(next: PeriodPreset) {
    setPreset(next);
    if (next !== "custom") onChange(presetPeriod(next));
  }

  const options: { key: PeriodPreset; label: string }[] = [
    { key: "day", label: t("admin.period.day") },
    { key: "week", label: t("admin.period.week") },
    { key: "month", label: t("admin.period.month") },
    { key: "custom", label: t("admin.period.custom") },
  ];

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        {options.map((o) => (
          <Pressable key={o.key} onPress={() => choose(o.key)} style={[styles.chip, preset === o.key && styles.chipOn]} accessibilityRole="button" accessibilityState={{ selected: preset === o.key }}>
            <Text style={[styles.chipText, preset === o.key && styles.chipTextOn]}>{o.label}</Text>
          </Pressable>
        ))}
      </View>
      {preset === "custom" && (
        <CalendarPicker
          mode="range"
          from={draft.from}
          to={draft.to}
          locale={locale}
          onChange={(next) => {
            setDraft(next);
            if (next.from && next.to) onChange(next);
          }}
        />
      )}
      <Text style={styles.hint}>{t("admin.period.showing").replace("{period}", formatPeriod(period))}</Text>
    </View>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    wrap: { gap: spacing.sm },
    row: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
    chip: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.full, borderWidth: 1, borderColor: colors.border },
    chipOn: { backgroundColor: colors.accentFrom, borderColor: "transparent" },
    chipText: { color: colors.foreground, fontWeight: "700", fontSize: 13, lineHeight: 19 },
    chipTextOn: { color: colors.white },
    hint: { color: colors.muted, fontSize: 12 },
  });
