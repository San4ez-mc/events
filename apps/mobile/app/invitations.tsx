import { useCallback, useEffect, useState } from "react";
import { router, Stack } from "expo-router";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { API_URL, getAccessToken } from "../src/lib/api-client";
import { useAuth } from "../src/lib/auth-context";
import { useTranslations } from "../src/lib/locale-context";
import { Button } from "../src/components/ui/Button";
import { EmptyState } from "../src/components/ui/ScreenHeader";
import { formatShortDateTime } from "../src/lib/format";
import type { EventInvitation } from "../src/lib/event-types";
import { colors, radius, spacing } from "../src/lib/theme";

/** §71 — the invitee's side: pending invitations to events organizers think they'd enjoy. Mirrors the web /invitations page. */
export default function MyInvitationsScreen() {
  const { isLoading: authLoading } = useAuth();
  const { t } = useTranslations();

  const [items, setItems] = useState<EventInvitation[] | null>(null);
  const [error, setError] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const token = getAccessToken();
    if (!token) return;
    const res = await fetch(`${API_URL}/api/v1/invitations/mine`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) {
      setError(true);
      return;
    }
    setItems((await res.json()) as EventInvitation[]);
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!getAccessToken()) {
      router.replace("/login");
      return;
    }
    void load();
  }, [authLoading, load]);

  async function respond(invitationId: string, action: "accept" | "decline") {
    const token = getAccessToken();
    if (!token) return;
    setBusyId(invitationId);
    try {
      const res = await fetch(`${API_URL}/api/v1/invitations/${invitationId}/${action}`, { method: "PATCH", headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) setItems((prev) => (prev ? prev.filter((i) => i.id !== invitationId) : prev));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <View style={styles.flex}>
      <Stack.Screen options={{ title: t("invitations.title"), headerStyle: { backgroundColor: colors.background }, headerTintColor: colors.foreground }} />
      {error && <Text style={styles.error}>{t("common.somethingWentWrong")}</Text>}
      {!error && items === null && <ActivityIndicator style={{ marginTop: spacing.xl }} color={colors.accentFrom} />}
      {!error && items !== null && (
        <FlatList
          data={items}
          keyExtractor={(i) => i.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={<EmptyState icon="mail-open-outline" text={t("invitations.empty")} />}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <Pressable onPress={() => router.push(`/event/${item.event.slug}`)}>
                <Text style={styles.title} numberOfLines={2}>
                  {item.event.title}
                </Text>
                {item.event.startsAt && <Text style={styles.date}>{formatShortDateTime(item.event.startsAt)}</Text>}
              </Pressable>
              <View style={styles.actions}>
                <Button title={t("invitations.accept")} loading={busyId === item.id} onPress={() => void respond(item.id, "accept")} style={styles.action} />
                <Button title={t("invitations.decline")} variant="secondary" loading={busyId === item.id} onPress={() => void respond(item.id, "decline")} style={styles.action} />
              </View>
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  list: { padding: spacing.lg, gap: spacing.md },
  error: { color: colors.danger, fontSize: 14, padding: spacing.lg },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.md },
  title: { color: colors.foreground, fontSize: 16, fontWeight: "700" },
  date: { color: colors.muted, fontSize: 12, marginTop: 2 },
  actions: { flexDirection: "row", gap: spacing.sm },
  action: { flex: 1 },
});
