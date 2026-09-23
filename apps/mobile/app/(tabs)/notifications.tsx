import { useCallback, useEffect, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { API_URL, getAccessToken } from "../../src/lib/api-client";
import { useTranslations } from "../../src/lib/locale-context";
import { colors, spacing } from "../../src/lib/theme";

interface NotificationItem {
  id: string;
  type: string;
  title: string;
  body: string;
  readAt: string | null;
  createdAt: string;
  payloadJson: { eventId?: string } | null;
}

export default function NotificationsScreen() {
  const { t, locale } = useTranslations();
  const [items, setItems] = useState<NotificationItem[] | null>(null);

  const load = useCallback(async () => {
    const token = getAccessToken();
    if (!token) return;
    const res = await fetch(`${API_URL}/api/v1/notifications`, { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) setItems((await res.json()).items);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function markRead(id: string) {
    const token = getAccessToken();
    if (!token) return;
    await fetch(`${API_URL}/api/v1/notifications/${id}/read`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}` },
    });
    setItems((prev) => (prev ? prev.map((n) => (n.id === id ? { ...n, readAt: new Date().toISOString() } : n)) : prev));
  }

  return (
    <View style={styles.container}>
      <Text style={styles.header}>{t("nav.notifications")}</Text>

      <FlatList
        data={items ?? []}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <Pressable
            style={[styles.row, !item.readAt && styles.rowUnread]}
            onPress={() => {
              void markRead(item.id);
            }}
          >
            <Text style={styles.title}>{item.title}</Text>
            <Text style={styles.body}>{item.body}</Text>
            <Text style={styles.date}>{new Date(item.createdAt).toLocaleString(locale === "uk" ? "uk-UA" : "en-US")}</Text>
          </Pressable>
        )}
        ListEmptyComponent={items !== null ? <Text style={styles.empty}>{t("common.empty")}</Text> : null}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: spacing.lg },
  header: { color: colors.foreground, fontSize: 22, fontWeight: "700", marginBottom: spacing.md },
  row: { paddingVertical: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border, gap: 2 },
  rowUnread: { opacity: 1 },
  title: { color: colors.foreground, fontSize: 15, fontWeight: "600" },
  body: { color: colors.muted, fontSize: 13 },
  date: { color: colors.muted, fontSize: 11 },
  empty: { color: colors.muted, textAlign: "center", marginTop: spacing.xl },
});
