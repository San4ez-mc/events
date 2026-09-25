import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { API_URL, getAccessToken } from "../../src/lib/api-client";
import { useTranslations } from "../../src/lib/locale-context";
import { SwipeCard } from "../../src/components/discover/SwipeCard";
import type { CursorPage, EventCard } from "../../src/lib/event-types";
import { colors, spacing } from "../../src/lib/theme";

const ACTIONS_HEIGHT = 72;
const ACTIONS_MARGIN = 20;

export default function DiscoverScreen() {
  const { t } = useTranslations();
  const insets = useSafeAreaInsets();
  const [cards, setCards] = useState<EventCard[] | null>(null);
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const cursorRef = useRef<string | null>(null);
  const historyRef = useRef<EventCard[]>([]);

  const loadPage = useCallback(async (afterCursor?: string) => {
    const params = new URLSearchParams({ limit: "10" });
    if (afterCursor) params.set("cursor", afterCursor);
    const token = getAccessToken();
    const res = await fetch(`${API_URL}/api/v1/discovery?${params.toString()}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });
    if (!res.ok) return;
    const body = (await res.json()) as CursorPage<EventCard>;
    setCards((prev) => (afterCursor ? [...(prev ?? []), ...body.items] : body.items));
    cursorRef.current = body.nextCursor;
  }, []);

  useEffect(() => {
    void loadPage();
  }, [loadPage]);

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
      if (rest.length < 3 && cursorRef.current) void loadPage(cursorRef.current);
      return rest;
    });
  }

  function pass(event: EventCard) {
    void recordInteraction(event.id, "PASS");
    advance(event);
  }

  function open(event: EventCard) {
    void recordInteraction(event.id, "OPEN");
    router.push(`/event/${event.slug}`);
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
          <Ionicons name="checkmark-circle-outline" size={64} color={colors.muted} />
          <Text style={styles.empty}>{t("discover.empty")}</Text>
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

      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]} pointerEvents="none">
        <Text style={styles.headerTitle}>{t("nav.discover")}</Text>
      </View>

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
  empty: { color: colors.muted, textAlign: "center", fontSize: 15 },
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
  header: { position: "absolute", top: 0, left: 0, right: 0, paddingHorizontal: spacing.lg },
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
