import { useCallback, useEffect, useMemo, useState } from "react";
import { FlatList, Image, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { Stack, router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { API_URL, getAccessToken } from "../src/lib/api-client";
import { useTranslations } from "../src/lib/locale-context";
import type { CursorPage, EventCard, RegistrationWithEvent } from "../src/lib/event-types";
import { colors, radius, spacing } from "../src/lib/theme";
import { EmptyState } from "../src/components/ui/ScreenHeader";

type Tab = "upcoming" | "pending" | "saved" | "past" | "mine";

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

interface Row {
  id: string;
  event: EventCard;
  status?: string;
}

async function getPage<T>(path: string): Promise<T[]> {
  const token = getAccessToken();
  if (!token) return [];
  const res = await fetch(`${API_URL}/api/v1${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) return [];
  const body = await res.json();
  return Array.isArray(body) ? body : ((body as CursorPage<T>).items ?? []);
}

/** UX §27 — Upcoming / Pending / Saved / Past, plus the events the user organizes. */
export default function MyEventsScreen() {
  const { t, locale } = useTranslations();
  const [tab, setTab] = useState<Tab>("upcoming");
  const [registrations, setRegistrations] = useState<RegistrationWithEvent[] | null>(null);
  const [saved, setSaved] = useState<EventCard[] | null>(null);
  const [mine, setMine] = useState<EventCard[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const [regs, sv, own] = await Promise.all([
      getPage<RegistrationWithEvent>("/registrations/mine"),
      getPage<EventCard>("/discovery/saved"),
      getPage<EventCard>("/events/mine"),
    ]);
    setRegistrations(regs);
    setSaved(sv);
    setMine(own);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const rows = useMemo<Row[] | null>(() => {
    if (!registrations || !saved || !mine) return null;
    const now = Date.now();
    const isPast = (e: EventCard) => !!e.startsAt && new Date(e.startsAt).getTime() < now;
    const active = registrations.filter((r) => !["CANCELLED", "REJECTED"].includes(r.status));
    switch (tab) {
      case "upcoming":
        return active.filter((r) => ["REGISTERED", "CONFIRMED", "PAYMENT_PENDING"].includes(r.status) && !isPast(r.event)).map((r) => ({ id: r.id, event: r.event, status: r.status }));
      case "pending":
        return active.filter((r) => ["PENDING", "WAITLISTED"].includes(r.status) && !isPast(r.event)).map((r) => ({ id: r.id, event: r.event, status: r.status }));
      case "past":
        return registrations.filter((r) => isPast(r.event)).map((r) => ({ id: r.id, event: r.event, status: r.status }));
      case "saved":
        return saved.map((e) => ({ id: e.id, event: e }));
      case "mine":
        return mine.map((e) => ({ id: e.id, event: e }));
    }
  }, [tab, registrations, saved, mine]);

  const tabs: { key: Tab; label: string }[] = [
    { key: "upcoming", label: t("myEvents.upcoming") },
    { key: "pending", label: t("myEvents.pending") },
    { key: "saved", label: t("myEvents.saved") },
    { key: "past", label: t("myEvents.past") },
    { key: "mine", label: t("myEvents.organized") },
  ];

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: t("nav.myEvents"), headerStyle: { backgroundColor: colors.background }, headerTintColor: colors.foreground }} />

      <View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
          {tabs.map((x) => (
            <Pressable key={x.key} onPress={() => setTab(x.key)} style={[styles.tab, tab === x.key && styles.tabOn]}>
              <Text style={[styles.tabText, tab === x.key && styles.tabTextOn]}>{x.label}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      <FlatList
        data={rows ?? []}
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
          <Pressable style={styles.row} onPress={() => router.push(`/event/${item.event.slug}`)}>
            {item.event.media[0] ? <Image source={{ uri: item.event.media[0].thumbnailUrl }} style={styles.thumb} /> : <View style={styles.thumb} />}
            <View style={styles.rowText}>
              <Text style={styles.title} numberOfLines={2}>
                {item.event.title}
              </Text>
              {item.event.startsAt && (
                <Text style={styles.subtitle}>
                  {new Date(item.event.startsAt).toLocaleString(locale === "uk" ? "uk-UA" : "en-US", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                </Text>
              )}
              <Text style={styles.subtitle} numberOfLines={1}>
                {[item.event.city?.nameUk, item.event.priceType === "FREE" ? t("common.free") : `${item.event.price ?? "?"} ${item.event.currency}`].filter(Boolean).join(" · ")}
              </Text>
              {item.status && <Text style={styles.status}>{t(STATUS_LABEL_KEYS[item.status] ?? item.status)}</Text>}
              {tab === "mine" && <Text style={styles.status}>{item.event.status}</Text>}
              {tab === "mine" && (
                <Pressable onPress={() => router.push(`/manage/${item.event.id}`)} hitSlop={8}>
                  <Text style={[styles.status, { textDecorationLine: "underline" }]}>
                    {t("organizerRegistrations.viewRegistrations")} · {t("organizerTools.stats")}
                  </Text>
                </Pressable>
              )}
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.muted} />
          </Pressable>
        )}
        ListEmptyComponent={rows !== null ? <EmptyState icon="ticket-outline" text={t(`myEvents.empty.${tab}`)} /> : null}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  tabs: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md, gap: spacing.sm },
  tab: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.full, paddingHorizontal: 14, paddingVertical: 8 },
  tabOn: { backgroundColor: colors.accentFrom, borderColor: colors.accentFrom },
  tabText: { color: colors.foreground, fontSize: 14, fontWeight: "600" },
  tabTextOn: { color: colors.white },
  list: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl, flexGrow: 1 },
  row: { flexDirection: "row", gap: spacing.md, paddingVertical: spacing.md, alignItems: "center", borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  thumb: { width: 60, height: 80, borderRadius: radius.md, backgroundColor: colors.surface },
  rowText: { flex: 1, gap: 2 },
  title: { color: colors.foreground, fontSize: 15, fontWeight: "700" },
  subtitle: { color: colors.muted, fontSize: 12 },
  status: { color: colors.accentFrom, fontSize: 12, fontWeight: "700", marginTop: 2 },
});
