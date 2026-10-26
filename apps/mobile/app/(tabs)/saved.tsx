import { useCallback, useState } from "react";
import { ActivityIndicator, FlatList, Image, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { API_URL, getAccessToken, refreshAccessToken } from "../../src/lib/api-client";
import { useTranslations } from "../../src/lib/locale-context";
import { formatPriceLabel, formatShortDateTime } from "../../src/lib/format";
import type { CursorPage, EventCard } from "../../src/lib/event-types";
import { radius, spacing, type Palette, useThemedStyles } from "../../src/lib/theme";
import { EmptyState, ScreenHeader } from "../../src/components/ui/ScreenHeader";

type Segment = "saved" | "created";

/** GET /events/mine/analytics — lifetime numbers for one event of mine (see EventsService.mineAnalytics). */
interface EventAnalytics {
  eventId: string;
  impressions: number;
  peopleSeen: number;
  views: number;
  peopleOpened: number;
  passes: number;
  saves: number;
  shares: number;
  ticketClicks: number;
  registrations: number;
  confirmed: number;
  openRatePercent: number | null;
}

const STATUS_KEYS: Record<string, string> = {
  DRAFT: "myEvents.status.DRAFT",
  PENDING_MODERATION: "myEvents.status.PENDING_MODERATION",
  PUBLISHED: "myEvents.status.PUBLISHED",
  COMPLETED: "myEvents.status.COMPLETED",
  CANCELLED: "myEvents.status.CANCELLED",
  REJECTED: "myEvents.status.REJECTED",
  ARCHIVED: "myEvents.status.ARCHIVED",
};

/** GET with the stored token; one silent refresh-and-retry if it has expired (a stale token used to leave a tab blank). */
async function authedGet(path: string): Promise<Response | null> {
  const token = getAccessToken();
  if (!token) return null;
  let res = await fetch(`${API_URL}/api/v1${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (res.status === 401) {
    const refreshed = await refreshAccessToken();
    if (refreshed) res = await fetch(`${API_URL}/api/v1${path}`, { headers: { Authorization: `Bearer ${refreshed}` } });
  }
  return res;
}

const asList = <T,>(body: unknown): T[] => (Array.isArray(body) ? (body as T[]) : (((body as CursorPage<T>).items ?? []) as T[]));

/**
 * "My events" tab (it replaced the heart): the events I saved and the events I created. For every created event the
 * organizer sees how it is doing — how many people saw the card, how many opened the details, passed, saved, shared and
 * registered — and can jump to the full statistics, the story/post pictures or the editor.
 */
export default function MyEventsTab() {
  const { colors, styles } = useThemedStyles(makeStyles);
  const { t } = useTranslations();
  const [segment, setSegment] = useState<Segment>("saved");
  const [saved, setSaved] = useState<EventCard[] | null>(null);
  const [created, setCreated] = useState<EventCard[] | null>(null);
  const [analytics, setAnalytics] = useState<Record<string, EventAnalytics>>({});
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    try {
      const [savedRes, mineRes, statsRes] = await Promise.all([authedGet("/discovery/saved?limit=50"), authedGet("/events/mine?limit=50"), authedGet("/events/mine/analytics")]);
      if (!savedRes?.ok || !mineRes?.ok) {
        setError(true);
        return;
      }
      setError(false);
      setSaved(asList<EventCard>(await savedRes.json()));
      setCreated(asList<EventCard>(await mineRes.json()));
      if (statsRes?.ok) {
        const rows = (await statsRes.json()) as EventAnalytics[];
        setAnalytics(Object.fromEntries(rows.map((r) => [r.eventId, r])));
      }
    } catch {
      setError(true);
    }
  }, []);

  // A bottom-tab screen stays mounted in the background — reload whenever the tab is shown again.
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const list = segment === "saved" ? saved : created;

  const tile = (value: number | string, label: string, icon: React.ComponentProps<typeof Ionicons>["name"]) => (
    <View key={label} style={styles.tile}>
      <Ionicons name={icon} size={14} color={colors.muted} />
      <Text style={styles.tileValue}>{value}</Text>
      <Text style={styles.tileLabel} numberOfLines={2}>
        {label}
      </Text>
    </View>
  );

  const renderCreated = (item: EventCard) => {
    const a = analytics[item.id];
    const live = item.status !== "DRAFT";
    const external = item.registrationMode === "EXTERNAL";
    return (
      <View style={styles.card}>
        <Pressable style={styles.cardHead} onPress={() => router.push(live ? `/event/${item.slug}` : `/edit/${item.id}`)}>
          {item.media[0] ? <Image source={{ uri: item.media[0].thumbnailUrl }} style={styles.thumb} /> : <View style={styles.thumb} />}
          <View style={styles.rowText}>
            <Text style={styles.title} numberOfLines={2}>
              {item.title}
            </Text>
            <Text style={[styles.statusChip, item.status === "PUBLISHED" && styles.statusLive]}>{t(STATUS_KEYS[item.status] ?? item.status)}</Text>
            {item.startsAt && <Text style={styles.subtitle}>{formatShortDateTime(item.startsAt)}</Text>}
            <Text style={styles.subtitle} numberOfLines={1}>
              {[item.city?.nameUk, formatPriceLabel(item, t)].filter(Boolean).join(" · ")}
            </Text>
          </View>
        </Pressable>

        {live && (
          <>
            <View style={styles.tiles}>
              {tile(a?.peopleSeen ?? 0, t("myEvents.stats.seen"), "eye-outline")}
              {tile(a?.peopleOpened ?? 0, t("myEvents.stats.opened"), "hand-left-outline")}
              {tile(a?.passes ?? 0, t("myEvents.stats.passed"), "close-circle-outline")}
            </View>
            <View style={styles.tiles}>
              {tile(a?.saves ?? 0, t("myEvents.stats.saved"), "heart-outline")}
              {tile(a?.shares ?? 0, t("myEvents.stats.shared"), "share-social-outline")}
              {external || (a?.ticketClicks ?? 0) > 0
                ? tile(a?.ticketClicks ?? 0, t("myEvents.stats.tickets"), "ticket-outline")
                : tile(a?.registrations ?? 0, t("myEvents.stats.registered"), "people-outline")}
            </View>
            {a?.openRatePercent != null && (
              <Text style={styles.rate}>{t("myEvents.stats.openRate").replace("{percent}", String(a.openRatePercent))}</Text>
            )}
          </>
        )}

        <View style={styles.actions}>
          {live ? (
            <>
              <Pressable onPress={() => router.push(`/manage/${item.id}`)} hitSlop={6}>
                <Text style={styles.action}>{t("myEvents.stats.details")}</Text>
              </Pressable>
              {(item.status === "PUBLISHED" || item.status === "COMPLETED") && (
                <Pressable onPress={() => router.push(`/share/${item.id}`)} hitSlop={6}>
                  <Text style={styles.action}>{t("referral.createStory")}</Text>
                </Pressable>
              )}
              <Pressable onPress={() => router.push(`/edit/${item.id}`)} hitSlop={6}>
                <Text style={styles.action}>{t("myEvents.edit")}</Text>
              </Pressable>
            </>
          ) : (
            <Pressable onPress={() => router.push(`/edit/${item.id}`)} hitSlop={6}>
              <Text style={styles.action}>{t("myEvents.continueDraft")}</Text>
            </Pressable>
          )}
        </View>
      </View>
    );
  };

  const renderSaved = (item: EventCard) => (
    <Pressable style={styles.row} onPress={() => router.push(`/event/${item.slug}`)}>
      {item.media[0] ? <Image source={{ uri: item.media[0].thumbnailUrl }} style={styles.thumb} /> : <View style={styles.thumb} />}
      <View style={styles.rowText}>
        <View style={styles.titleRow}>
          <Text style={styles.title} numberOfLines={2}>
            {item.title}
          </Text>
          {!!item.startsAt && new Date(item.startsAt).getTime() < Date.now() && <Text style={styles.pastBadge}>{t("myEvents.pastEvent")}</Text>}
        </View>
        {item.startsAt && <Text style={styles.subtitle}>{formatShortDateTime(item.startsAt)}</Text>}
        <Text style={styles.subtitle} numberOfLines={1}>
          {[item.city?.nameUk, formatPriceLabel(item, t)].filter(Boolean).join(" · ")}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.muted} />
    </Pressable>
  );

  return (
    <View style={styles.container}>
      <ScreenHeader title={t("nav.myEvents")} icon="calendar" />

      <View style={styles.segments}>
        {(["saved", "created"] as const).map((key) => (
          <Pressable key={key} onPress={() => setSegment(key)} style={[styles.segment, segment === key && styles.segmentOn]}>
            <Text style={[styles.segmentText, segment === key && { color: colors.white }]}>{key === "saved" ? t("myEvents.saved") : t("myEvents.organized")}</Text>
          </Pressable>
        ))}
      </View>

      <FlatList
        data={list ?? []}
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
        ListHeaderComponent={segment === "created" && (created?.length ?? 0) > 0 ? <Text style={styles.help}>{t("myEvents.stats.help")}</Text> : null}
        renderItem={({ item }) => (segment === "created" ? renderCreated(item) : renderSaved(item))}
        ListFooterComponent={
          <Pressable style={styles.registrationsLink} onPress={() => router.push("/my-events")}>
            <Ionicons name="ticket-outline" size={18} color={colors.accentFrom} />
            <Text style={styles.registrationsText}>{t("myEvents.registrations")}</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.muted} />
          </Pressable>
        }
        ListEmptyComponent={
          list !== null ? (
            <EmptyState icon={segment === "saved" ? "heart-outline" : "add-circle-outline"} text={t(segment === "saved" ? "myEvents.empty.saved" : "myEvents.empty.mine")} />
          ) : error ? (
            <EmptyState icon="alert-circle-outline" text={t("common.somethingWentWrong")} />
          ) : (
            <ActivityIndicator color={colors.accentFrom} style={{ marginTop: spacing.xl }} />
          )
        }
      />
    </View>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    list: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl, flexGrow: 1, gap: spacing.sm },
    segments: { flexDirection: "row", gap: spacing.sm, paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
    segment: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: radius.full, borderWidth: 1, borderColor: colors.border },
    segmentOn: { backgroundColor: colors.accentFrom, borderColor: "transparent" },
    segmentText: { color: colors.foreground, fontWeight: "700", fontSize: 14 },
    help: { color: colors.muted, fontSize: 12, lineHeight: 17, marginBottom: spacing.xs },
    row: { flexDirection: "row", gap: spacing.md, paddingVertical: spacing.md, alignItems: "center", borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
    thumb: { width: 60, height: 80, borderRadius: radius.md, backgroundColor: colors.surface },
    rowText: { flex: 1, gap: 2 },
    titleRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs, flexWrap: "wrap" },
    title: { color: colors.foreground, fontSize: 15, fontWeight: "700" },
    pastBadge: { color: colors.muted, fontSize: 10, fontWeight: "700", borderWidth: 1, borderColor: colors.border, borderRadius: radius.full, paddingHorizontal: 6, paddingVertical: 1 },
    subtitle: { color: colors.muted, fontSize: 12 },
    card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, gap: spacing.sm },
    cardHead: { flexDirection: "row", gap: spacing.md, alignItems: "center" },
    statusChip: { alignSelf: "flex-start", color: colors.muted, fontSize: 11, fontWeight: "800", borderWidth: 1, borderColor: colors.border, borderRadius: radius.full, paddingHorizontal: 8, paddingVertical: 2, overflow: "hidden" },
    statusLive: { color: colors.success, borderColor: colors.success },
    tiles: { flexDirection: "row", gap: spacing.sm },
    tile: { flex: 1, backgroundColor: colors.background, borderRadius: radius.md, paddingVertical: spacing.sm, paddingHorizontal: spacing.sm, alignItems: "center", gap: 2 },
    tileValue: { color: colors.foreground, fontSize: 20, fontWeight: "800" },
    tileLabel: { color: colors.muted, fontSize: 11, textAlign: "center", lineHeight: 14 },
    rate: { color: colors.muted, fontSize: 12 },
    actions: { flexDirection: "row", flexWrap: "wrap", gap: spacing.lg, paddingTop: spacing.xs },
    action: { color: colors.accentFrom, fontSize: 13, fontWeight: "700" },
    registrationsLink: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: spacing.lg },
    registrationsText: { flex: 1, color: colors.foreground, fontSize: 14, fontWeight: "600" },
  });
