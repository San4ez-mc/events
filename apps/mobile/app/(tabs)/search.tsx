import { useCallback, useEffect, useRef, useState } from "react";
import { captureEvent } from "../../src/lib/product-analytics";
import { FlatList, Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import * as SecureStore from "expo-secure-store";
import { EMPTY_FILTERS, countActiveFilters, filtersToQuery, type DiscoveryFilters } from "@kiro/types";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { API_URL, getAccessToken } from "../../src/lib/api-client";
import { useTranslations } from "../../src/lib/locale-context";
import { TextField } from "../../src/components/ui/TextField";
import { FiltersSheet } from "../../src/components/discover/FiltersSheet";
import type { CursorPage, EventCard } from "../../src/lib/event-types";
import { radius, spacing, type Palette, useThemedStyles } from "../../src/lib/theme";
import { ScreenHeader, EmptyState } from "../../src/components/ui/ScreenHeader";

/** Same key the feed saves its filters under: the city picked there is already selected here. */
const FILTERS_KEY = "kiro_discover_filters";

export default function SearchScreen() {
  const { colors, styles } = useThemedStyles(makeStyles);
  const { t, locale } = useTranslations();
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<DiscoveryFilters>(EMPTY_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [cityName, setCityName] = useState<string | null>(null);
  const [results, setResults] = useState<EventCard[] | null>(null);
  // Instead of a dead end when nothing matches: what is coming up (loaded once, on the first empty search).
  const [suggestions, setSuggestions] = useState<EventCard[] | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestId = useRef(0);
  const active = countActiveFilters(filters);

  // Start from the filters the feed already remembers, so people don't re-enter their city.
  useEffect(() => {
    void SecureStore.getItemAsync(FILTERS_KEY)
      .then((raw) => {
        if (raw) setFilters({ ...EMPTY_FILTERS, ...(JSON.parse(raw) as Partial<DiscoveryFilters>) });
      })
      .catch(() => {});
  }, []);

  // The chip shows the city's name, not its id.
  useEffect(() => {
    if (!filters.cityId) {
      setCityName(null);
      return;
    }
    void fetch(`${API_URL}/api/v1/geography/cities`)
      .then((r) => (r.ok ? r.json() : []))
      .then((list: { id: string; nameUk: string; nameEn: string | null }[]) => {
        const c = list.find((x) => x.id === filters.cityId);
        setCityName(c ? (locale === "uk" ? c.nameUk : (c.nameEn ?? c.nameUk)) : null);
      })
      .catch(() => {});
  }, [filters.cityId, locale]);

  /** Text and/or filters: with text it is a search narrowed by the filters; with filters alone it is a filtered browse. */
  const load = useCallback(
    async (q: string, f: DiscoveryFilters) => {
      const text = q.trim();
      const id = ++requestId.current;
      if (!text && countActiveFilters(f) === 0) {
        setResults(null);
        return;
      }
      const token = getAccessToken();
      const headers = token ? { Authorization: `Bearer ${token}` } : undefined;
      const filterQuery = filtersToQuery(f, null);
      const url = text
        ? `${API_URL}/api/v1/search?q=${encodeURIComponent(q)}${filterQuery ? `&${filterQuery}` : ""}`
        : `${API_URL}/api/v1/discovery?limit=30${filterQuery ? `&${filterQuery}` : ""}`;
      const res = await fetch(url, { headers }).catch(() => null);
      if (id !== requestId.current || !res?.ok) return; // a newer keystroke/filter change superseded this one
      const items = ((await res.json()) as CursorPage<EventCard>).items;
      setResults(items);
      if (items.length === 0 && suggestions === null) {
        const feed = await fetch(`${API_URL}/api/v1/discovery?limit=5`, { headers }).catch(() => null);
        if (feed?.ok) setSuggestions(((await feed.json()) as CursorPage<EventCard>).items);
      }
      // One event per finished search (not per keystroke): wait for the typing to settle.
      if (text) {
        if (searchTimer.current) clearTimeout(searchTimer.current);
        searchTimer.current = setTimeout(() => captureEvent("search", { query: text.toLowerCase().slice(0, 80), results_count: items.length, filters: countActiveFilters(f) }), 1200);
      }
    },
    [suggestions],
  );

  function applyFilters(next: DiscoveryFilters) {
    setFilters(next);
    void load(query, next);
  }

  const quick = (patch: Partial<DiscoveryFilters>) => applyFilters({ ...filters, ...patch });
  const toggleDate = (preset: "today" | "tomorrow" | "weekend") => quick({ datePreset: filters.datePreset === preset ? "any" : preset, dateFrom: "", dateTo: "" });

  const renderRow = (item: EventCard) => (
    <Pressable key={item.id} style={styles.row} onPress={() => router.push(`/event/${item.slug}?src=search`)}>
      {item.media[0] ? <Image source={{ uri: item.media[0].thumbnailUrl }} style={styles.thumb} /> : <View style={[styles.thumb, styles.thumbPlaceholder]} />}
      <View style={styles.rowText}>
        <Text style={styles.title} numberOfLines={1}>
          {item.title}
        </Text>
        <Text style={styles.subtitle} numberOfLines={1}>
          {[item.city?.nameUk, item.category?.nameUk].filter(Boolean).join(" · ")}
        </Text>
      </View>
    </Pressable>
  );

  const chip = (label: string, on: boolean, onPress: () => void, icon?: keyof typeof Ionicons.glyphMap) => (
    <Pressable key={label} onPress={onPress} style={[styles.chip, on && styles.chipOn]} accessibilityRole="button" accessibilityState={{ selected: on }}>
      {icon && <Ionicons name={icon} size={14} color={on ? colors.white : colors.foreground} />}
      <Text style={[styles.chipText, on && styles.chipTextOn]}>{label}</Text>
    </Pressable>
  );

  return (
    <View style={styles.container}>
      <ScreenHeader title={t("nav.search")} subtitle={t("screens.searchSubtitle")} icon="search" />
      <TextField
        label={t("nav.search")}
        value={query}
        onChangeText={(value) => {
          setQuery(value);
          void load(value, filters);
        }}
      />

      {/* The filters people would otherwise type in by hand (city, day, price) are right here, like in the feed. */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsScroll} contentContainerStyle={styles.chips}>
        <Pressable onPress={() => setFiltersOpen(true)} style={[styles.chip, active > 0 && styles.chipOn]} accessibilityLabel={t("discover.filters")}>
          <Ionicons name="options-outline" size={14} color={active > 0 ? colors.white : colors.foreground} />
          <Text style={[styles.chipText, active > 0 && styles.chipTextOn]}>{active > 0 ? `${t("discover.filters")} · ${active}` : t("discover.filters")}</Text>
        </Pressable>
        {chip(cityName ?? t("discover.anyCity"), filters.cityId !== null, () => setFiltersOpen(true), "location-outline")}
        {chip(t("discover.today"), filters.datePreset === "today", () => toggleDate("today"))}
        {chip(t("discover.tomorrow"), filters.datePreset === "tomorrow", () => toggleDate("tomorrow"))}
        {chip(t("search.weekend"), filters.datePreset === "weekend", () => toggleDate("weekend"))}
        {chip(t("search.free"), filters.freeOnly, () => quick({ freeOnly: !filters.freeOnly }))}
        {active > 0 && chip(t("search.clearFilters"), false, () => applyFilters(EMPTY_FILTERS), "close-circle-outline")}
      </ScrollView>

      <FlatList
        style={styles.list}
        data={results ?? []}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => renderRow(item)}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          results !== null ? (
            <View>
              <EmptyState icon="sad-outline" text={t("screens.searchNothing")} />
              {suggestions && suggestions.length > 0 && (
                <View style={{ gap: spacing.xs }}>
                  <Text style={styles.empty}>{t("search.nothingTry")}</Text>
                  {suggestions.map(renderRow)}
                </View>
              )}
            </View>
          ) : (
            <EmptyState icon="sparkles" title={t("screens.searchHintTitle")} text={t("screens.searchHintText")} />
          )
        }
      />

      <FiltersSheet visible={filtersOpen} filters={filters} onApply={(next) => { setFiltersOpen(false); applyFilters(next); }} onClose={() => setFiltersOpen(false)} />
    </View>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, paddingHorizontal: spacing.lg, gap: spacing.md },
  // A horizontal ScrollView in a column grows to fill all free height unless told not to.
  chipsScroll: { flexGrow: 0 },
  chips: { gap: spacing.sm, paddingVertical: 2, paddingRight: spacing.lg },
  chip: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.full, borderWidth: 1, borderColor: colors.border },
  chipOn: { backgroundColor: colors.accentFrom, borderColor: "transparent" },
  chipText: { color: colors.foreground, fontWeight: "700", fontSize: 13, lineHeight: 19 },
  chipTextOn: { color: colors.white },
  list: { flex: 1, marginTop: spacing.sm },
  row: { flexDirection: "row", gap: spacing.sm, paddingVertical: spacing.sm, alignItems: "center" },
  thumb: { width: 48, height: 64, borderRadius: radius.sm, backgroundColor: colors.surface },
  thumbPlaceholder: {},
  rowText: { flex: 1, gap: 2 },
  title: { color: colors.foreground, fontSize: 15, fontWeight: "600" },
  subtitle: { color: colors.muted, fontSize: 12 },
  empty: { color: colors.muted, textAlign: "center", marginTop: spacing.xl },
});
