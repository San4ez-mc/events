import { useCallback, useState } from "react";
import { FlatList, Image, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { API_URL, getAccessToken } from "../../src/lib/api-client";
import { useTranslations } from "../../src/lib/locale-context";
import { formatPriceLabel, formatShortDateTime } from "../../src/lib/format";
import type { CursorPage, EventCard } from "../../src/lib/event-types";
import { radius, spacing, type Palette, useThemedStyles } from "../../src/lib/theme";
import { EmptyState, ScreenHeader } from "../../src/components/ui/ScreenHeader";

/** The heart tab — a direct, always-one-tap-away view of saved events (previously only reachable via Profile -> My events -> Saved). */
export default function SavedScreen() {
  const { colors, styles } = useThemedStyles(makeStyles);
  const { t } = useTranslations();
  const [saved, setSaved] = useState<EventCard[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const token = getAccessToken();
    if (!token) return;
    const res = await fetch(`${API_URL}/api/v1/discovery/saved`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return;
    const body = await res.json();
    setSaved(Array.isArray(body) ? body : ((body as CursorPage<EventCard>).items ?? []));
  }, []);

  // A bottom-tab screen stays mounted in the background — a mount-only effect never re-ran when
  // revisiting this tab, so a newly-saved event wouldn't show up until the app restarted.
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  return (
    <View style={styles.container}>
      <ScreenHeader title={t("myEvents.saved")} icon="heart" />
      <FlatList
        data={saved ?? []}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor={colors.accentFrom}
            onRefresh={async () => {
              setRefreshing(true);
              await load();
              setRefreshing(false);
            }}
          />
        }
        renderItem={({ item }) => (
          <Pressable style={styles.row} onPress={() => router.push(`/event/${item.slug}`)}>
            {item.media[0] ? <Image source={{ uri: item.media[0].thumbnailUrl }} style={styles.thumb} /> : <View style={styles.thumb} />}
            <View style={styles.rowText}>
              <View style={styles.titleRow}>
                <Text style={styles.title} numberOfLines={2}>
                  {item.title}
                </Text>
                {!!item.startsAt && new Date(item.startsAt).getTime() < Date.now() && (
                  <Text style={styles.pastBadge}>{t("myEvents.pastEvent")}</Text>
                )}
              </View>
              {item.startsAt && <Text style={styles.subtitle}>{formatShortDateTime(item.startsAt)}</Text>}
              <Text style={styles.subtitle} numberOfLines={1}>
                {[item.city?.nameUk, formatPriceLabel(item, t)].filter(Boolean).join(" · ")}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.muted} />
          </Pressable>
        )}
        ListEmptyComponent={saved !== null ? <EmptyState icon="heart-outline" text={t("myEvents.empty.saved")} /> : null}
      />
    </View>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  list: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl, flexGrow: 1 },
  row: { flexDirection: "row", gap: spacing.md, paddingVertical: spacing.md, alignItems: "center", borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  thumb: { width: 60, height: 80, borderRadius: radius.md, backgroundColor: colors.surface },
  rowText: { flex: 1, gap: 2 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs, flexWrap: "wrap" },
  title: { color: colors.foreground, fontSize: 15, fontWeight: "700" },
  pastBadge: { color: colors.muted, fontSize: 10, fontWeight: "700", borderWidth: 1, borderColor: colors.border, borderRadius: radius.full, paddingHorizontal: 6, paddingVertical: 1 },
  subtitle: { color: colors.muted, fontSize: 12 },
});
