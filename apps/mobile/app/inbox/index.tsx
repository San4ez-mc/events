import { useCallback, useEffect, useState } from "react";
import { router } from "expo-router";
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { API_URL, getAccessToken } from "../../src/lib/api-client";
import { useAuth } from "../../src/lib/auth-context";
import { useTranslations } from "../../src/lib/locale-context";
import { formatShortDate } from "../../src/lib/format";
import { personName, type InquiryListItem } from "../../src/lib/inbox-types";
import { EmptyState, ScreenHeader } from "../../src/components/ui/ScreenHeader";
import { AdminLoader } from "../../src/components/admin/AdminLoader";
import { radius, spacing, type Palette, useThemedStyles } from "../../src/lib/theme";

/** Conversations with organizers (as an asker) and questions people sent to your events (as an organizer). */
export default function InboxScreen() {
  const { styles } = useThemedStyles(makeStyles);
  const { user, isLoading } = useAuth();
  const { t } = useTranslations();
  const [items, setItems] = useState<InquiryListItem[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const token = getAccessToken();
    if (!token) return;
    const res = await fetch(`${API_URL}/api/v1/inquiries`, { headers: { Authorization: `Bearer ${token}` } }).catch(() => null);
    if (res?.ok) setItems((await res.json()) as InquiryListItem[]);
  }, []);

  useEffect(() => {
    if (isLoading) return;
    if (!user) {
      router.replace("/login");
      return;
    }
    void load();
    const timer = setInterval(() => void load(), 20000);
    return () => clearInterval(timer);
  }, [isLoading, user, load]);

  return (
    <View style={styles.container}>
      <FlatList
        data={items ?? []}
        keyExtractor={(i) => i.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load().finally(() => setRefreshing(false)); }} />}
        ListHeaderComponent={<ScreenHeader title={t("inbox.title")} subtitle={t("inbox.subtitle")} icon="chatbubbles" />}
        ListEmptyComponent={items === null ? <AdminLoader /> : <EmptyState icon="chatbubbles-outline" text={t("inbox.empty")} />}
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm }}
        renderItem={({ item }) => (
          <Pressable style={styles.row} onPress={() => router.push(`/inbox/${item.id}`)}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{(personName(item.counterpart) || "?").slice(0, 1).toUpperCase()}</Text>
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <View style={styles.topLine}>
                <Text style={styles.name} numberOfLines={1}>{personName(item.counterpart)}</Text>
                <Text style={styles.muted}>{formatShortDate(item.lastMessageAt)}</Text>
              </View>
              <Text style={styles.muted} numberOfLines={1}>
                {item.role === "ORGANIZER" ? t("inbox.withAsker") : t("inbox.withOrganizer")} · {item.event.title}
              </Text>
              {item.lastMessage && (
                <Text style={[styles.preview, item.unread > 0 && styles.previewUnread]} numberOfLines={1}>
                  {item.lastMessage.mine ? `${t("inbox.you")}: ` : ""}
                  {item.lastMessage.text}
                </Text>
              )}
            </View>
            {item.unread > 0 && <View style={styles.dot} />}
          </Pressable>
        )}
      />
    </View>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    row: { flexDirection: "row", gap: spacing.md, alignItems: "center", backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius.lg, padding: spacing.md },
    avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.accentFrom, alignItems: "center", justifyContent: "center" },
    avatarText: { color: colors.white, fontWeight: "800", fontSize: 18 },
    topLine: { flexDirection: "row", justifyContent: "space-between", gap: spacing.sm },
    name: { color: colors.foreground, fontWeight: "700", fontSize: 15, flex: 1 },
    muted: { color: colors.muted, fontSize: 12 },
    preview: { color: colors.muted, fontSize: 14 },
    previewUnread: { color: colors.foreground, fontWeight: "700" },
    dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.accentTo },
  });
