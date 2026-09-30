import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Animated, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { API_URL, getAccessToken } from "../../src/lib/api-client";
import { useTranslations } from "../../src/lib/locale-context";
import { formatShortDateTime } from "../../src/lib/format";
import { radius, spacing, type Palette, useThemedStyles } from "../../src/lib/theme";
import { ScreenHeader, EmptyState } from "../../src/components/ui/ScreenHeader";

interface NotificationItem {
  id: string;
  type: string;
  title: string;
  body: string;
  readAt: string | null;
  createdAt: string;
  payloadJson: { eventId?: string; slug?: string; friendshipId?: string; invitationId?: string } | null;
}

const FRIEND_TYPES = new Set(["FRIEND_REQUEST", "FRIEND_ACCEPTED", "FRIEND_EVENT_REGISTERED"]);

async function authed<T = unknown>(path: string, init: RequestInit = {}): Promise<T | null> {
  const token = getAccessToken();
  if (!token) return null;
  const res = await fetch(`${API_URL}/api/v1${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, ...init.headers } });
  if (!res.ok) return null;
  return res.json().catch(() => null);
}

export default function NotificationsScreen() {
  const { colors, styles } = useThemedStyles(makeStyles);
  const { t } = useTranslations();
  const [items, setItems] = useState<NotificationItem[] | null>(null);
  const highlightIds = useRef<Set<string>>(new Set());
  const fade = useRef(new Animated.Value(1)).current;

  const load = useCallback(async () => {
    const body = await authed<{ items: NotificationItem[] }>("/notifications");
    if (!body) return;
    // Snapshot which ones were unread *before* this view fades their highlight away.
    highlightIds.current = new Set(body.items.filter((n) => !n.readAt).map((n) => n.id));
    setItems(body.items);
    fade.setValue(1);
    Animated.timing(fade, { toValue: 0, duration: 2500, delay: 400, useNativeDriver: false }).start();
    if (highlightIds.current.size > 0) void authed("/notifications/read-all", { method: "PATCH" });
  }, [fade]);

  useEffect(() => {
    void load();
  }, [load]);

  const highlightColor = fade.interpolate({ inputRange: [0, 1], outputRange: [colors.background, colors.surface] });

  async function open(item: NotificationItem) {
    if (!item.readAt) await authed(`/notifications/${item.id}/read`, { method: "PATCH" });

    if (FRIEND_TYPES.has(item.type)) {
      router.push("/friends");
      return;
    }
    if (item.type.includes("INVITATION") || item.payloadJson?.invitationId) {
      router.push("/invitations");
      return;
    }
    const eventId = item.payloadJson?.eventId;
    if (!eventId) return;
    if (item.payloadJson?.slug) {
      router.push(`/event/${item.payloadJson.slug}`);
      return;
    }
    const event = await authed<{ slug: string }>(`/events/${eventId}`);
    if (event?.slug) router.push(`/event/${event.slug}`);
  }

  function clearAll() {
    Alert.alert(t("screens.notificationsClearConfirmTitle"), t("screens.notificationsClearConfirmBody"), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("screens.notificationsClear"),
        style: "destructive",
        onPress: async () => {
          await authed("/notifications", { method: "DELETE" });
          setItems([]);
        },
      },
    ]);
  }

  const hasItems = (items?.length ?? 0) > 0;

  return (
    <View style={styles.container}>
      <ScreenHeader title={t("nav.notifications")} subtitle={t("screens.notificationsSubtitle")} icon="notifications" />
      {hasItems && (
        <Pressable style={styles.clearButton} onPress={clearAll}>
          <Text style={styles.clearButtonText}>{t("screens.notificationsClear")}</Text>
        </Pressable>
      )}

      <FlatList
        data={items ?? []}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <NotificationRow
            item={item}
            highlighted={highlightIds.current.has(item.id)}
            highlightColor={highlightColor}
            styles={styles}
            onPress={() => void open(item)}
          />
        )}
        ListEmptyComponent={items !== null ? <EmptyState icon="notifications-outline" text={t("screens.notificationsEmpty")} /> : null}
      />
    </View>
  );
}

function NotificationRow({
  item,
  highlighted,
  highlightColor,
  styles,
  onPress,
}: {
  item: NotificationItem;
  highlighted: boolean;
  highlightColor: Animated.AnimatedInterpolation<string | number>;
  styles: ReturnType<typeof makeStyles>;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress}>
      <Animated.View style={[styles.row, highlighted && { backgroundColor: highlightColor }]}>
        <Text style={styles.title}>{item.title}</Text>
        <Text style={styles.body}>{item.body}</Text>
        <Text style={styles.date}>{formatShortDateTime(item.createdAt)}</Text>
      </Animated.View>
    </Pressable>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, paddingHorizontal: spacing.lg },
  clearButton: { alignSelf: "flex-end", marginBottom: spacing.sm },
  clearButtonText: { color: colors.muted, fontSize: 13, fontWeight: "600" },
  row: { paddingVertical: spacing.sm, paddingHorizontal: spacing.sm, borderRadius: radius.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border, gap: 2 },
  title: { color: colors.foreground, fontSize: 15, fontWeight: "600" },
  body: { color: colors.muted, fontSize: 13 },
  date: { color: colors.muted, fontSize: 11 },
});
