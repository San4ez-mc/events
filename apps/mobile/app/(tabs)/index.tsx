import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { API_URL, getAccessToken } from "../../src/lib/api-client";
import { useTranslations } from "../../src/lib/locale-context";
import { SwipeCard } from "../../src/components/discover/SwipeCard";
import { Button } from "../../src/components/ui/Button";
import type { CursorPage, EventCard } from "../../src/lib/event-types";
import { colors, spacing } from "../../src/lib/theme";

export default function DiscoverScreen() {
  const { t } = useTranslations();
  const [cards, setCards] = useState<EventCard[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

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
    setCursor(body.nextCursor);
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

  function advance() {
    setCards((prev) => {
      if (!prev || prev.length === 0) return prev;
      const [, ...rest] = prev;
      if (rest.length < 3 && cursor) void loadPage(cursor);
      return rest;
    });
  }

  async function pass(event: EventCard) {
    setBusyId(event.id);
    await recordInteraction(event.id, "PASS");
    setBusyId(null);
    advance();
  }

  async function open(event: EventCard) {
    void recordInteraction(event.id, "OPEN");
    router.push(`/event/${event.slug}`);
    advance();
  }

  async function save(event: EventCard) {
    const token = getAccessToken();
    if (!token) return;
    setBusyId(event.id);
    try {
      await fetch(`${API_URL}/api/v1/discovery/${event.id}/save`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
    } finally {
      setBusyId(null);
    }
  }

  if (cards === null) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accentFrom} />
      </View>
    );
  }

  const visible = cards.slice(0, 3);

  return (
    <View style={styles.container}>
      <Text style={styles.header}>{t("nav.discover")}</Text>

      {visible.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.empty}>{t("discover.empty")}</Text>
        </View>
      ) : (
        <View style={styles.stack}>
          {visible
            .slice()
            .reverse()
            .map((event, i) => (
              <SwipeCard
                key={event.id}
                event={event}
                isTop={i === visible.length - 1}
                onPass={() => void pass(event)}
                onOpen={() => void open(event)}
              />
            ))}
        </View>
      )}

      {visible[0] && (
        <View style={styles.actions}>
          <Button title={t("discover.pass")} variant="secondary" onPress={() => void pass(visible[0]!)} disabled={busyId === visible[0]!.id} />
          <Button title={t("discover.save")} variant="secondary" onPress={() => void save(visible[0]!)} disabled={busyId === visible[0]!.id} />
          <Button title={t("discover.open")} onPress={() => void open(visible[0]!)} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: spacing.lg },
  header: { color: colors.foreground, fontSize: 22, fontWeight: "700", marginBottom: spacing.md },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  empty: { color: colors.muted },
  stack: { flex: 1, alignItems: "center" },
  actions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.lg },
});
