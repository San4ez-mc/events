import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Modal,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
  type LayoutChangeEvent,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  EMPTY_FILTERS,
  PRICE_SLIDER_MAX,
  type DatePreset,
  type DiscoveryFilters,
  type FormatFilter,
  type GroupSize,
  type TimePreset,
} from "@kiro/types";
import { API_URL } from "../../lib/api-client";
import { useTranslations } from "../../lib/locale-context";
import { colors, radius, spacing } from "../../lib/theme";

export interface Option {
  id: string;
  label: string;
  indent?: boolean;
}
interface Named {
  id: string;
  nameUk: string;
  nameEn: string | null;
  children?: Named[];
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

export function Chips<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <View style={styles.chips}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable key={o.value} onPress={() => onChange(o.value)} style={[styles.chip, on && styles.chipOn]} accessibilityState={{ selected: on }}>
            <Text style={[styles.chipText, on && styles.chipTextOn]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Search box + a short scrollable list. Single- or multi-select (§7 city / district / categories). */
export function SearchPicker({
  options,
  selected,
  multi,
  onChange,
  placeholder,
  emptyLabel,
}: {
  options: Option[];
  selected: string[];
  multi: boolean;
  onChange: (ids: string[]) => void;
  placeholder: string;
  emptyLabel: string;
}) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options;
  }, [options, query]);

  function toggle(id: string) {
    if (multi) onChange(selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id]);
    else onChange(selected.includes(id) ? [] : [id]);
  }

  return (
    <View style={styles.picker}>
      <View style={styles.pickerSearch}>
        <Ionicons name="search" size={16} color={colors.muted} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder={placeholder}
          placeholderTextColor={colors.muted}
          style={styles.pickerInput}
          accessibilityLabel={placeholder}
        />
      </View>
      <ScrollView style={styles.pickerList} nestedScrollEnabled keyboardShouldPersistTaps="handled">
        {filtered.length === 0 && <Text style={styles.pickerEmpty}>{emptyLabel}</Text>}
        {filtered.map((o) => {
          const on = selected.includes(o.id);
          return (
            <Pressable key={o.id} onPress={() => toggle(o.id)} style={[styles.pickerRow, o.indent && { paddingLeft: spacing.xl }]}>
              <Text style={[styles.pickerText, on && styles.pickerTextOn]}>{o.label}</Text>
              {on && <Ionicons name="checkmark" size={18} color={colors.accentFrom} />}
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

/** Two-thumb price slider built on PanResponder (no native slider dependency). */
function RangeSlider({ low, high, max, step, onChange }: { low: number; high: number; max: number; step: number; onChange: (low: number, high: number) => void }) {
  const [width, setWidth] = useState(0);
  const state = useRef({ low, high, width: 0, startLow: low, startHigh: high });
  state.current.low = low;
  state.current.high = high;
  state.current.width = width;

  const clamp = (v: number) => Math.min(max, Math.max(0, Math.round(v / step) * step));
  const valueAt = (dx: number, start: number) => clamp(start + (dx / Math.max(1, state.current.width)) * max);

  const lowResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: () => (state.current.startLow = state.current.low),
      onPanResponderMove: (_, g) => onChange(Math.min(valueAt(g.dx, state.current.startLow), state.current.high), state.current.high),
    }),
  ).current;
  const highResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: () => (state.current.startHigh = state.current.high),
      onPanResponderMove: (_, g) => onChange(state.current.low, Math.max(valueAt(g.dx, state.current.startHigh), state.current.low)),
    }),
  ).current;

  const lowX = (low / max) * width;
  const highX = (high / max) * width;

  return (
    <View style={styles.sliderWrap} onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}>
      <View style={styles.sliderTrack} />
      <View style={[styles.sliderFill, { left: lowX, width: Math.max(0, highX - lowX) }]} />
      <View {...lowResponder.panHandlers} style={[styles.thumb, { left: lowX - 14 }]} />
      <View {...highResponder.panHandlers} style={[styles.thumb, { left: highX - 14 }]} />
    </View>
  );
}

/** UX §7 — full filter set as a bottom sheet. Mounted only while `visible`, so the draft re-seeds each open. */
export function FiltersSheet({ visible, filters, onApply, onClose }: { visible: boolean; filters: DiscoveryFilters; onApply: (f: DiscoveryFilters) => void; onClose: () => void }) {
  const { t, locale } = useTranslations();
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = useState(filters);
  const [cities, setCities] = useState<Named[]>([]);
  const [districts, setDistricts] = useState<Named[]>([]);
  const [categories, setCategories] = useState<Named[]>([]);
  const set = (patch: Partial<DiscoveryFilters>) => setDraft((d) => ({ ...d, ...patch }));
  const name = (n: Named) => (locale === "uk" ? n.nameUk : (n.nameEn ?? n.nameUk));

  useEffect(() => {
    if (!visible) return;
    setDraft(filters);
    void (async () => {
      const [c, cat] = await Promise.all([
        fetch(`${API_URL}/api/v1/geography/cities`).then((r) => (r.ok ? r.json() : [])),
        fetch(`${API_URL}/api/v1/categories`).then((r) => (r.ok ? r.json() : [])),
      ]).catch(() => [[], []]);
      setCities(c as Named[]);
      setCategories(cat as Named[]);
    })();
  }, [visible, filters]);

  useEffect(() => {
    if (!draft.cityId) {
      setDistricts([]);
      return;
    }
    let cancelled = false;
    void fetch(`${API_URL}/api/v1/geography/districts?cityId=${draft.cityId}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => !cancelled && setDistricts(d as Named[]))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [draft.cityId]);

  const cityOptions: Option[] = cities.map((c) => ({ id: c.id, label: name(c) }));
  const districtOptions: Option[] = districts.map((d) => ({ id: d.id, label: name(d) }));
  const categoryOptions: Option[] = categories.flatMap((c) => [
    { id: c.id, label: name(c) },
    ...(c.children ?? []).map((ch) => ({ id: ch.id, label: name(ch), indent: true })),
  ]);

  const dateOptions: { value: DatePreset; label: string }[] = [
    { value: "any", label: t("filters.dateAny") },
    { value: "today", label: t("filters.dateToday") },
    { value: "tomorrow", label: t("filters.dateTomorrow") },
    { value: "weekend", label: t("filters.dateWeekend") },
  ];
  const timeOptions: { value: TimePreset; label: string }[] = [
    { value: "any", label: t("filters.timeAny") },
    { value: "morning", label: t("filters.timeMorning") },
    { value: "day", label: t("filters.timeDay") },
    { value: "evening", label: t("filters.timeEvening") },
    { value: "night", label: t("filters.timeNight") },
  ];
  const formatOptions: { value: FormatFilter; label: string }[] = [
    { value: "any", label: t("filters.formatAny") },
    { value: "OFFLINE", label: t("filters.formatOffline") },
    { value: "ONLINE", label: t("filters.formatOnline") },
  ];
  const groupOptions: { value: GroupSize; label: string }[] = [
    { value: "any", label: t("filters.groupAny") },
    { value: "1-5", label: "1–5" },
    { value: "5-10", label: "5–10" },
    { value: "10-20", label: "10–20" },
    { value: "20+", label: "20+" },
  ];

  const low = draft.minPrice ?? 0;
  const high = draft.maxPrice ?? PRICE_SLIDER_MAX;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom }]}>
          <View style={styles.header}>
            <Text style={styles.headerTitle}>{t("filters.title")}</Text>
            <Pressable onPress={onClose} hitSlop={12} accessibilityLabel={t("discover.closeFilters")}>
              <Ionicons name="close" size={26} color={colors.foreground} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
            <Section title={t("filters.city")}>
              <SearchPicker
                options={cityOptions}
                selected={draft.cityId ? [draft.cityId] : []}
                multi={false}
                onChange={(ids) => set({ cityId: ids[0] ?? null, districtIds: [] })}
                placeholder={t("filters.search")}
                emptyLabel={t("filters.noResults")}
              />
            </Section>

            {draft.cityId && districtOptions.length > 0 && (
              <Section title={`${t("filters.district")}${draft.districtIds.length ? ` · ${draft.districtIds.length}` : ""}`}>
                <SearchPicker options={districtOptions} selected={draft.districtIds} multi onChange={(ids) => set({ districtIds: ids })} placeholder={t("filters.search")} emptyLabel={t("filters.noResults")} />
              </Section>
            )}

            <Section title={`${t("filters.category")}${draft.categoryIds.length ? ` · ${draft.categoryIds.length}` : ""}`}>
              <SearchPicker options={categoryOptions} selected={draft.categoryIds} multi onChange={(ids) => set({ categoryIds: ids })} placeholder={t("filters.search")} emptyLabel={t("filters.noResults")} />
            </Section>

            <Section title={t("filters.date")}>
              <Chips value={draft.datePreset} options={dateOptions} onChange={(v) => set({ datePreset: v })} />
            </Section>

            <Section title={t("filters.time")}>
              <Chips value={draft.timePreset} options={timeOptions} onChange={(v) => set({ timePreset: v })} />
            </Section>

            <Section title={t("filters.price")}>
              <View style={styles.switchRow}>
                <Text style={styles.switchLabel}>{t("filters.free")}</Text>
                <Switch value={draft.freeOnly} onValueChange={(v) => set({ freeOnly: v })} trackColor={{ true: colors.accentFrom }} />
              </View>
              {!draft.freeOnly && (
                <>
                  <View style={styles.priceRow}>
                    <Text style={styles.priceText}>
                      {t("filters.priceMin")} {low} ₴
                    </Text>
                    <Text style={styles.priceText}>
                      {t("filters.priceMax")} {high >= PRICE_SLIDER_MAX ? `${PRICE_SLIDER_MAX}+` : high} ₴
                    </Text>
                  </View>
                  <RangeSlider low={low} high={high} max={PRICE_SLIDER_MAX} step={50} onChange={(l, h) => set({ minPrice: l, maxPrice: h })} />
                </>
              )}
            </Section>

            <Section title={t("filters.format")}>
              <Chips value={draft.format} options={formatOptions} onChange={(v) => set({ format: v })} />
            </Section>

            <Section title={t("filters.age")}>
              <Chips
                value={draft.adultsOnly ? "adults" : "all"}
                options={[
                  { value: "all", label: t("filters.ageAll") },
                  { value: "adults", label: t("filters.ageAdults") },
                ]}
                onChange={(v) => set({ adultsOnly: v === "adults" })}
              />
            </Section>

            <Section title={t("filters.group")}>
              <Chips value={draft.groupSize} options={groupOptions} onChange={(v) => set({ groupSize: v })} />
            </Section>
          </ScrollView>

          <View style={styles.footer}>
            <Pressable onPress={() => setDraft(EMPTY_FILTERS)} style={styles.reset}>
              <Text style={styles.resetText}>{t("filters.reset")}</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                onApply(draft);
                onClose();
              }}
              style={styles.apply}
            >
              <Text style={styles.applyText}>{t("filters.apply")}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.55)" },
  sheet: { maxHeight: "92%", backgroundColor: colors.background, borderTopLeftRadius: 24, borderTopRightRadius: 24 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: spacing.lg, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  headerTitle: { color: colors.foreground, fontSize: 20, fontWeight: "800" },
  body: { padding: spacing.lg, gap: spacing.lg },
  section: { gap: spacing.sm },
  sectionTitle: { color: colors.foreground, fontSize: 14, fontWeight: "700" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  chip: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.full, paddingHorizontal: 14, paddingVertical: 8 },
  chipOn: { backgroundColor: colors.accentFrom, borderColor: colors.accentFrom },
  chipText: { color: colors.foreground, fontSize: 14, fontWeight: "600" },
  chipTextOn: { color: colors.white },
  picker: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, overflow: "hidden" },
  pickerSearch: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  pickerInput: { flex: 1, color: colors.foreground, paddingVertical: 10, fontSize: 14 },
  pickerList: { maxHeight: 176 },
  pickerEmpty: { color: colors.muted, padding: spacing.md, fontSize: 14 },
  pickerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.md, paddingVertical: 11 },
  pickerText: { color: colors.foreground, fontSize: 14 },
  pickerTextOn: { fontWeight: "700" },
  switchRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  switchLabel: { color: colors.foreground, fontSize: 14 },
  priceRow: { flexDirection: "row", justifyContent: "space-between" },
  priceText: { color: colors.foreground, fontSize: 14, fontWeight: "700" },
  sliderWrap: { height: 36, justifyContent: "center" },
  sliderTrack: { height: 4, borderRadius: 2, backgroundColor: colors.border },
  sliderFill: { position: "absolute", height: 4, borderRadius: 2, backgroundColor: colors.accentFrom },
  thumb: { position: "absolute", width: 28, height: 28, borderRadius: 14, backgroundColor: colors.white, borderWidth: 3, borderColor: colors.accentFrom, top: 4 },
  footer: { flexDirection: "row", gap: spacing.md, padding: spacing.lg, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  reset: { paddingHorizontal: spacing.lg, justifyContent: "center" },
  resetText: { color: colors.muted, fontSize: 15, fontWeight: "700" },
  apply: { flex: 1, backgroundColor: colors.accentFrom, borderRadius: radius.full, paddingVertical: 14, alignItems: "center" },
  applyText: { color: colors.white, fontSize: 15, fontWeight: "800" },
});
