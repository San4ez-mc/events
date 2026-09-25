import { useCallback, useEffect, useState } from "react";
import { FlatList, Image, Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { API_URL, getAccessToken } from "../../src/lib/api-client";
import { useTranslations } from "../../src/lib/locale-context";
import type { CursorPage, RegistrationWithEvent } from "../../src/lib/event-types";
import { colors, radius, spacing } from "../../src/lib/theme";
import { ScreenHeader, EmptyState } from "../../src/components/ui/ScreenHeader";

const STATUS_LABEL_KEYS: Record<string, string> = {
  PENDING: "registration.pending",
  REGISTERED: "registration.registered",
  PAYMENT_PENDING: "registration.paymentPendingConfirmation",
  CONFIRMED: "registration.confirmed",
  REJECTED: "registration.rejected",
  CANCELLED: "registration.cancelRegistration",
  WAITLISTED: "registration.waitlisted",
  ATTENDED: "registration.confirmed",
  NO_SHOW: "registration.rejected",
};

/** §64's "My Events" tab — the attendee's own registrations. Creating/managing events stays a web-only surface for now (mobile focuses on the discovery/consumption tabs from §64). */
export default function MyEventsScreen() {
  const { t } = useTranslations();
  const [items, setItems] = useState<RegistrationWithEvent[] | null>(null);

  const load = useCallback(async () => {
    const token = getAccessToken();
    if (!token) return;
    const res = await fetch(`${API_URL}/api/v1/registrations/mine`, { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) setItems((await res.json() as CursorPage<RegistrationWithEvent>).items);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <View style={styles.container}>
      <ScreenHeader title={t("nav.myEvents")} subtitle={t("screens.myEventsSubtitle")} icon="ticket" />

      <FlatList
        data={items ?? []}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <Pressable style={styles.row} onPress={() => router.push(`/event/${item.event.slug}`)}>
            {item.event.media[0] ? (
              <Image source={{ uri: item.event.media[0].thumbnailUrl }} style={styles.thumb} />
            ) : (
              <View style={[styles.thumb, styles.thumbPlaceholder]} />
            )}
            <View style={styles.rowText}>
              <Text style={styles.title} numberOfLines={1}>
                {item.event.title}
              </Text>
              <Text style={styles.subtitle}>{t(STATUS_LABEL_KEYS[item.status] ?? item.status)}</Text>
            </View>
          </Pressable>
        )}
        ListEmptyComponent={items !== null ? <EmptyState icon="ticket-outline" text={t("screens.myEventsEmpty")} /> : null}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, paddingHorizontal: spacing.lg },
  header: { color: colors.foreground, fontSize: 22, fontWeight: "700", marginBottom: spacing.md },
  row: { flexDirection: "row", gap: spacing.sm, paddingVertical: spacing.sm, alignItems: "center" },
  thumb: { width: 48, height: 64, borderRadius: radius.sm, backgroundColor: colors.surface },
  thumbPlaceholder: {},
  rowText: { flex: 1, gap: 2 },
  title: { color: colors.foreground, fontSize: 15, fontWeight: "600" },
  subtitle: { color: colors.muted, fontSize: 12 },
  empty: { color: colors.muted, textAlign: "center", marginTop: spacing.xl },
});
