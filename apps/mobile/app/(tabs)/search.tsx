import { useCallback, useState } from "react";
import { FlatList, Image, Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { API_URL, getAccessToken } from "../../src/lib/api-client";
import { useTranslations } from "../../src/lib/locale-context";
import { TextField } from "../../src/components/ui/TextField";
import type { CursorPage, EventCard } from "../../src/lib/event-types";
import { colors, radius, spacing } from "../../src/lib/theme";
import { ScreenHeader, EmptyState } from "../../src/components/ui/ScreenHeader";

export default function SearchScreen() {
  const { t } = useTranslations();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<EventCard[] | null>(null);

  const search = useCallback(async (q: string) => {
    if (!q.trim()) {
      setResults(null);
      return;
    }
    const token = getAccessToken();
    const res = await fetch(`${API_URL}/api/v1/search?q=${encodeURIComponent(q)}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });
    if (res.ok) setResults((await res.json() as CursorPage<EventCard>).items);
  }, []);

  return (
    <View style={styles.container}>
      <ScreenHeader title={t("nav.search")} subtitle={t("screens.searchSubtitle")} icon="search" />
      <TextField
        label={t("nav.search")}
        value={query}
        onChangeText={(value) => {
          setQuery(value);
          void search(value);
        }}
      />

      <FlatList
        style={styles.list}
        data={results ?? []}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <Pressable style={styles.row} onPress={() => router.push(`/event/${item.slug}?src=search`)}>
            {item.media[0] ? (
              <Image source={{ uri: item.media[0].thumbnailUrl }} style={styles.thumb} />
            ) : (
              <View style={[styles.thumb, styles.thumbPlaceholder]} />
            )}
            <View style={styles.rowText}>
              <Text style={styles.title} numberOfLines={1}>
                {item.title}
              </Text>
              <Text style={styles.subtitle} numberOfLines={1}>
                {[item.city?.nameUk, item.category?.nameUk].filter(Boolean).join(" · ")}
              </Text>
            </View>
          </Pressable>
        )}
        ListEmptyComponent={
          query.trim() && results !== null ? (
            <EmptyState icon="sad-outline" text={t("screens.searchNothing")} />
          ) : (
            <EmptyState icon="sparkles" title={t("screens.searchHintTitle")} text={t("screens.searchHintText")} />
          )
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, paddingHorizontal: spacing.lg, gap: spacing.md },
  header: { color: colors.foreground, fontSize: 22, fontWeight: "700" },
  list: { flex: 1, marginTop: spacing.sm },
  row: { flexDirection: "row", gap: spacing.sm, paddingVertical: spacing.sm, alignItems: "center" },
  thumb: { width: 48, height: 64, borderRadius: radius.sm, backgroundColor: colors.surface },
  thumbPlaceholder: {},
  rowText: { flex: 1, gap: 2 },
  title: { color: colors.foreground, fontSize: 15, fontWeight: "600" },
  subtitle: { color: colors.muted, fontSize: 12 },
  empty: { color: colors.muted, textAlign: "center", marginTop: spacing.xl },
});
