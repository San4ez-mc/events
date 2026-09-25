import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, Share, StyleSheet, Text, View } from "react-native";
import * as SecureStore from "expo-secure-store";
import { EMPTY_FILTERS, countActiveFilters, filtersToQuery, type DiscoveryFilters } from "@kiro/types";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { API_URL, getAccessToken } from "../../src/lib/api-client";
import { useTranslations } from "../../src/lib/locale-context";
import { track } from "../../src/lib/analytics";
import { SwipeCard } from "../../src/components/discover/SwipeCard";
import { FiltersSheet } from "../../src/components/discover/FiltersSheet";
import type { CursorPage, EventCard } from "../../src/lib/event-types";
import { colors, spacing } from "../../src/lib/theme";

const FILTERS_KEY = "kiro_discover_filters";
const ACTIONS_HEIGHT = 72;
const ACTIONS_MARGIN = 20;

export default function DiscoverScreen() {
  const { t } = useTranslations();
  const insets = useSafeAreaInsets();
  const [cards, setCards] = useState<EventCard[] | null>(null);
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const cursorRef = useRef<string | null>(null);
  const [filters, setFilters] = useState<DiscoveryFilters>(EMPTY_FILTERS);
  const filtersRef = useRef(filters);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const historyRef = useRef<EventCard[]>([]);

  const loadPage = useCallback(async (activeFilters: DiscoveryFilters, afterCursor?: string) => {
    const query = filtersToQuery(activeFilters, afterCursor ?? null);
    const token = getAccessToken();
    const res = await fetch(`${API_URL}/api/v1/discovery?limit=10${query ? `&${query}` : ""}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });
    if (!res.ok) return;
    const body = (await res.json()) as CursorPage<EventCard>;
    setCards((prev) => (afterCursor ? [...(prev ?? []), ...body.items] : body.items));
    cursorRef.current = body.nextCursor;
  }, []);

  useEffect(() => {
    void (async () => {
      let initial = EMPTY_FILTERS;
      try {
        const raw = await SecureStore.getItemAsync(FILTERS_KEY);
        if (raw) initial = { ...EMPTY_FILTERS, ...(JSON.parse(raw) as Partial<DiscoveryFilters>) };
      } catch {
        // No saved filters — start unfiltered.
      }
      filtersRef.current = initial;
      setFilters(initial);
      await loadPage(initial);
    })();
  }, [loadPage]);

  /** §7 — apply, remember on this device, and mirror the profile-mappable part to the account. */
  /** End-of-feed "Look again": forget the skipped events server-side, then reload from the top. */
  async function seeAgain() {
    const token = getAccessToken();
    if (token) {
      await fetch(`${API_URL}/api/v1/discovery/passes`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } }).catch(() => {});
    }
    historyRef.current = [];
    setCards(null);
    await loadPage(filtersRef.current);
  }

  async function applyFilters(next: DiscoveryFilters) {
    filtersRef.current = next;
    setFilters(next);
    historyRef.current = [];
    void SecureStore.setItemAsync(FILTERS_KEY, JSON.stringify(next)).catch(() => {});
    const token = getAccessToken();
    if (token) {
      void fetch(`${API_URL}/api/v1/discovery/preferences`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          preferredCityId: next.cityId,
          preferredDistrictIds: next.districtIds,
          preferredCategoryIds: next.categoryIds,
          preferredFormat: next.format === "any" ? null : next.format,
          freeOnly: next.freeOnly,
          maxBudget: next.maxPrice !== null && next.maxPrice < 2000 ? next.maxPrice : null,
        }),
      }).catch(() => {});
    }
    setCards(null);
    await loadPage(next);
  }

  async function shareEvent(event: EventCard) {
    track(event.id, "SHARE");
    const url = `${API_URL}/events/${event.slug}`;
    await Share.share({ message: `${event.title}
${url}`, url, title: event.title }).catch(() => {});
  }

  async function recordInteraction(eventId: string, interaction: "PASS" | "OPEN") {
    const token = getAccessToken();
    if (!token) return;
    await fetch(`${API_URL}/api/v1/discovery/${eventId}/interactions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ interaction }),
    }).catch(() => {});
  }

  function advance(event: EventCard) {
    historyRef.current.push(event);
    setCards((prev) => {
      if (!prev) return prev;
      const rest = prev.filter((c) => c.id !== event.id);
      if (rest.length < 3 && cursorRef.current) void loadPage(filtersRef.current, cursorRef.current);
      return rest;
    });
  }

  function pass(event: EventCard) {
    void recordInteraction(event.id, "PASS");
    advance(event);
  }

  function open(event: EventCard) {
    void recordInteraction(event.id, "OPEN");
    router.push(`/event/${event.slug}?src=swipe`);
    advance(event);
  }

  function undo() {
    const last = historyRef.current.pop();
    if (last) setCards((prev) => [last, ...(prev ?? [])]);
  }

  async function toggleSave(event: EventCard) {
    const token = getAccessToken();
    if (!token) {
      router.push("/login");
      return;
    }
    const wasSaved = saved.has(event.id);
    setSaved((prev) => {
      const next = new Set(prev);
      if (wasSaved) next.delete(event.id);
      else next.add(event.id);
      return next;
    });
    await fetch(`${API_URL}/api/v1/discovery/${event.id}/save`, {
      method: wasSaved ? "DELETE" : "POST",
      headers: { Authorization: `Bearer ${token}` },
    }).catch(() => {});
  }

  // §35 — one impression per card that reaches the top of the stack. (Hooks must stay above the early return below.)
  const lastImpression = useRef<string | null>(null);
  const topId = cards?.[0]?.id;
  useEffect(() => {
    if (topId && lastImpression.current !== topId) {
      lastImpression.current = topId;
      track(topId, "IMPRESSION");
    }
  }, [topId]);

  if (cards === null) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accentFrom} />
      </View>
    );
  }

  const visible = cards.slice(0, 2);
  const top = visible[0];
  const infoInset = ACTIONS_HEIGHT + ACTIONS_MARGIN * 2;

  return (
    <View style={styles.container}>
      {visible.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="sparkles" size={64} color={colors.accentFrom} />
          <Text style={styles.endTitle}>{t("discover.endTitle")}</Text>
          <Text style={styles.empty}>{t("discover.endText")}</Text>
          <Pressable onPress={() => void seeAgain()} style={[styles.emptyButton, styles.emptyButtonPrimary]}>
            <Ionicons name="refresh" size={18} color={colors.white} />
            <Text style={[styles.emptyButtonText, { color: colors.white }]}>{t("discover.seeAgain")}</Text>
          </Pressable>
          <Pressable onPress={() => setFiltersOpen(true)} style={styles.emptyButton}>
            <Ionicons name="options-outline" size={18} color={colors.foreground} />
            <Text style={styles.emptyButtonText}>{t("discover.changeFilters")}</Text>
          </Pressable>
          {historyRef.current.length > 0 && (
            <Pressable onPress={undo} style={styles.emptyButton}>
              <Ionicons name="arrow-undo" size={18} color={colors.foreground} />
              <Text style={styles.emptyButtonText}>{t("discover.undo")}</Text>
            </Pressable>
          )}
        </View>
      ) : (
        visible
          .slice()
          .reverse()
          .map((event, i) => (
            <SwipeCard
              key={event.id}
              event={event}
              isTop={i === visible.length - 1}
              bottomInset={infoInset}
              onPass={() => pass(event)}
              onOpen={() => open(event)}
            />
          ))
      )}

      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]} pointerEvents="box-none">
        <Text style={styles.headerTitle}>{t("nav.discover")}</Text>
        <View style={styles.headerActions}>
          {top && (
            <Pressable onPress={() => void shareEvent(top)} style={styles.headerButton} accessibilityLabel={t("discover.share")}>
              <Ionicons name="share-social-outline" size={22} color={colors.white} />
            </Pressable>
          )}
          <Pressable onPress={() => setFiltersOpen(true)} style={styles.headerButton} accessibilityLabel={t("discover.filters")}>
            <Ionicons name="options-outline" size={22} color={colors.white} />
            {countActiveFilters(filters) > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{countActiveFilters(filters)}</Text>
              </View>
            )}
          </Pressable>
        </View>
      </View>

      <FiltersSheet visible={filtersOpen} filters={filters} onApply={(f) => void applyFilters(f)} onClose={() => setFiltersOpen(false)} />

      {top && (
        <View style={[styles.actions, { bottom: ACTIONS_MARGIN }]}>
          <RoundButton icon="arrow-undo" size={48} color="#f59e0b" onPress={undo} disabled={historyRef.current.length === 0} />
          <RoundButton icon="close" size={64} color="#f43f5e" onPress={() => pass(top)} />
          <RoundButton
            icon={saved.has(top.id) ? "heart" : "heart-outline"}
            size={64}
            color={saved.has(top.id) ? colors.white : "#ec4899"}
            filled={saved.has(top.id)}
            onPress={() => void toggleSave(top)}
          />
          <RoundButton icon="arrow-forward" size={48} color="#34d399" onPress={() => open(top)} />
        </View>
      )}
    </View>
  );
}

function RoundButton({
  icon,
  size,
  color,
  onPress,
  disabled,
  filled,
}: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  size: number;
  color: string;
  onPress: () => void;
  disabled?: boolean;
  filled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.round,
        { width: size, height: size, borderRadius: size / 2 },
        filled && { backgroundColor: colors.accentTo, borderColor: colors.accentTo },
        disabled && { opacity: 0.4 },
        pressed && { transform: [{ scale: 0.92 }] },
      ]}
    >
      <Ionicons name={icon} size={size * 0.5} color={color} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.md, padding: spacing.xl },
  empty: { color: colors.muted, textAlign: "center", fontSize: 15, paddingHorizontal: spacing.xl },
  endTitle: { color: colors.foreground, fontSize: 22, fontWeight: "800", textAlign: "center" },
  emptyButtonPrimary: { backgroundColor: colors.accentFrom, borderColor: "transparent" },
  emptyButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  emptyButtonText: { color: colors.foreground, fontWeight: "600" },
  header: { position: "absolute", top: 0, left: 0, right: 0, paddingHorizontal: spacing.lg, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  headerActions: { flexDirection: "row", gap: spacing.sm },
  headerButton: { width: 42, height: 42, borderRadius: 21, backgroundColor: "rgba(0,0,0,0.45)", alignItems: "center", justifyContent: "center" },
  badge: { position: "absolute", top: -2, right: -2, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: colors.accentTo, alignItems: "center", justifyContent: "center", paddingHorizontal: 4 },
  badgeText: { color: colors.white, fontSize: 11, fontWeight: "800" },
  headerTitle: { color: colors.white, fontSize: 24, fontWeight: "800", textShadowColor: "rgba(0,0,0,0.5)", textShadowRadius: 6 },
  actions: {
    position: "absolute",
    left: 0,
    right: 0,
    height: ACTIONS_HEIGHT,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.lg,
  },
  round: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(20,20,30,0.78)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
  },
});
