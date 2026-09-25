import { useRef } from "react";
import { Animated, Dimensions, Image, PanResponder, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { EventCard } from "../../lib/event-types";
import { useTranslations } from "../../lib/locale-context";
import { colors, radius, spacing } from "../../lib/theme";

const SCREEN_WIDTH = Dimensions.get("window").width;
const SWIPE_THRESHOLD = SCREEN_WIDTH * 0.28;

function formatDate(iso: string, locale: string): string {
  const date = new Date(iso);
  const tag = locale === "uk" ? "uk-UA" : "en-US";
  const day = date.toLocaleDateString(tag, { weekday: "short", day: "numeric", month: "long" });
  const time = date.toLocaleTimeString(tag, { hour: "2-digit", minute: "2-digit" });
  return `${day} · ${time}`;
}

/**
 * UX §65/§66 — swipe left => PASS, swipe right (or tap) => OPEN. Full-bleed card
 * on core RN `Animated` + `PanResponder`. The responder is created once, so it
 * reads `isTop`/callbacks through refs — otherwise a card that started
 * underneath the stack would keep its stale `isTop = false` and never swipe.
 */
export function SwipeCard({
  event,
  onPass,
  onOpen,
  isTop,
  bottomInset,
}: {
  event: EventCard;
  onPass: () => void;
  onOpen: () => void;
  isTop: boolean;
  bottomInset: number;
}) {
  const { t, locale } = useTranslations();
  const pan = useRef(new Animated.ValueXY()).current;

  const isTopRef = useRef(isTop);
  const onPassRef = useRef(onPass);
  const onOpenRef = useRef(onOpen);
  isTopRef.current = isTop;
  onPassRef.current = onPass;
  onOpenRef.current = onOpen;

  const rotate = pan.x.interpolate({ inputRange: [-SCREEN_WIDTH, 0, SCREEN_WIDTH], outputRange: ["-10deg", "0deg", "10deg"] });
  const passOpacity = pan.x.interpolate({ inputRange: [-SWIPE_THRESHOLD, 0], outputRange: [1, 0], extrapolate: "clamp" });
  const openOpacity = pan.x.interpolate({ inputRange: [0, SWIPE_THRESHOLD], outputRange: [0, 1], extrapolate: "clamp" });

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => isTopRef.current && Math.abs(g.dx) > 8 && Math.abs(g.dx) > Math.abs(g.dy),
      onPanResponderMove: Animated.event([null, { dx: pan.x, dy: pan.y }], { useNativeDriver: false }),
      onPanResponderRelease: (_, g) => {
        if (g.dx > SWIPE_THRESHOLD) {
          Animated.timing(pan, { toValue: { x: SCREEN_WIDTH * 1.5, y: g.dy }, duration: 180, useNativeDriver: false }).start(() =>
            onOpenRef.current(),
          );
          return;
        }
        if (g.dx < -SWIPE_THRESHOLD) {
          Animated.timing(pan, { toValue: { x: -SCREEN_WIDTH * 1.5, y: g.dy }, duration: 180, useNativeDriver: false }).start(() =>
            onPassRef.current(),
          );
          return;
        }
        Animated.spring(pan, { toValue: { x: 0, y: 0 }, useNativeDriver: false }).start();
      },
      onPanResponderTerminate: () => {
        Animated.spring(pan, { toValue: { x: 0, y: 0 }, useNativeDriver: false }).start();
      },
    }),
  ).current;

  const cover = event.media[0];
  const place = [event.city?.nameUk, event.district?.nameUk].filter(Boolean).join(", ");
  const isFree = event.priceType === "FREE";
  const social = event.social;
  const goingLabel = event.capacity ? `${social?.registeredCount ?? 0} / ${event.capacity}` : String(social?.registeredCount ?? 0);

  return (
    <Animated.View
      {...(isTop ? panResponder.panHandlers : {})}
      style={[styles.card, isTop && { transform: [...pan.getTranslateTransform(), { rotate }] }]}
    >
      <Pressable style={StyleSheet.absoluteFill} onPress={() => onOpenRef.current()} disabled={!isTop}>
        {cover ? (
          <Image source={{ uri: cover.displayUrl }} style={StyleSheet.absoluteFill} resizeMode="cover" />
        ) : (
          <View style={[StyleSheet.absoluteFill, styles.placeholder]}>
            <Ionicons name="calendar" size={72} color="rgba(255,255,255,0.6)" />
          </View>
        )}

        <View style={styles.topShade} pointerEvents="none" />
        <View style={styles.bottomShade} pointerEvents="none" />

        <View style={[styles.info, { bottom: bottomInset }]} pointerEvents="none">
          <View style={styles.chips}>
            {event.category && (
              <View style={styles.chip}>
                <Text style={styles.chipText}>{locale === "uk" ? event.category.nameUk : event.category.nameEn}</Text>
              </View>
            )}
            <View style={[styles.chip, isFree ? styles.chipFree : styles.chipPaid]}>
              <Text style={[styles.chipText, !isFree && { color: "#111" }]}>
                {isFree ? t("common.free") : `${event.price ?? "?"} ${event.currency}`}
              </Text>
            </View>
          </View>
          <Text style={styles.title} numberOfLines={3}>
            {event.title}
          </Text>
          {event.startsAt && (
            <View style={styles.metaRow}>
              <Ionicons name="calendar-outline" size={16} color="rgba(255,255,255,0.75)" />
              <Text style={styles.meta}>{formatDate(event.startsAt, locale)}</Text>
            </View>
          )}
          {event.format === "OFFLINE" && place ? (
            <View style={styles.metaRow}>
              <Ionicons name="location-outline" size={16} color="rgba(255,255,255,0.75)" />
              <Text style={styles.meta}>{place}</Text>
            </View>
          ) : null}
          {event.format === "ONLINE" && (
            <View style={styles.metaRow}>
              <Ionicons name="videocam-outline" size={16} color="rgba(255,255,255,0.75)" />
              <Text style={styles.meta}>{t("events.wizard.formatOnline")}</Text>
            </View>
          )}
          {event.description ? (
            <Text style={styles.description} numberOfLines={2}>
              {event.description}
            </Text>
          ) : null}
          {social && (
            <View style={styles.socialRow}>
              <View style={styles.metaRow}>
                <Ionicons name="people" size={16} color="rgba(255,255,255,0.8)" />
                <Text style={styles.going}>
                  {goingLabel} <Text style={styles.goingLabel}>{t("discover.participants")}</Text>
                </Text>
              </View>
              <View style={styles.avatars}>
                {social.attendeePreviews.map((p, i) => (
                  <View key={p.id} style={[styles.avatarWrap, i > 0 && { marginLeft: -8 }]}>
                    {p.avatarUrl ? (
                      <Image source={{ uri: p.avatarUrl }} style={styles.avatar} />
                    ) : (
                      <View style={[styles.avatar, styles.avatarFallback]}>
                        <Text style={styles.avatarInitial}>{(p.name ?? "?").slice(0, 1).toUpperCase()}</Text>
                      </View>
                    )}
                  </View>
                ))}
                {social.registeredCount > social.attendeePreviews.length && (
                  <View style={[styles.avatar, styles.avatarMore, social.attendeePreviews.length > 0 && { marginLeft: -8 }]}>
                    <Text style={styles.avatarInitial}>+{social.registeredCount - social.attendeePreviews.length}</Text>
                  </View>
                )}
              </View>
              {social.friendsGoingCount > 0 && (
                <View style={styles.friendsChip}>
                  <Ionicons name="people-circle" size={14} color={colors.white} />
                  <Text style={styles.friendsText}>
                    {social.friendsGoingCount} {t("discover.going")}
                  </Text>
                </View>
              )}
              {social.organizerRating.average !== null && (
                <View style={styles.metaRow}>
                  <Ionicons name="star" size={14} color="#fcd34d" />
                  <Text style={styles.rating}>{social.organizerRating.average.toFixed(1)}</Text>
                </View>
              )}
            </View>
          )}
        </View>

        {isTop && (
          <>
            <Animated.View style={[styles.stamp, styles.stampPass, { opacity: passOpacity }]} pointerEvents="none">
              <Text style={[styles.stampText, { color: "#f43f5e" }]}>{t("discover.pass")}</Text>
            </Animated.View>
            <Animated.View style={[styles.stamp, styles.stampOpen, { opacity: openOpacity }]} pointerEvents="none">
              <Text style={[styles.stampText, { color: "#34d399" }]}>{t("discover.open")}</Text>
            </Animated.View>
          </>
        )}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.surface, overflow: "hidden" },
  placeholder: { backgroundColor: colors.accentFrom, alignItems: "center", justifyContent: "center" },
  topShade: { position: "absolute", top: 0, left: 0, right: 0, height: 140, backgroundColor: "rgba(0,0,0,0.35)" },
  bottomShade: { position: "absolute", bottom: 0, left: 0, right: 0, height: "48%", backgroundColor: "rgba(0,0,0,0.6)" },
  info: { position: "absolute", left: spacing.lg, right: spacing.lg, gap: 6 },
  chips: { flexDirection: "row", gap: spacing.sm, marginBottom: 4 },
  chip: { backgroundColor: "rgba(255,255,255,0.18)", borderRadius: radius.full, paddingHorizontal: 12, paddingVertical: 4 },
  chipFree: { backgroundColor: "rgba(16,185,129,0.9)" },
  chipPaid: { backgroundColor: "rgba(255,255,255,0.92)" },
  chipText: { color: colors.white, fontSize: 12, fontWeight: "700" },
  title: { color: colors.white, fontSize: 28, fontWeight: "800", lineHeight: 33 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  meta: { color: "rgba(255,255,255,0.9)", fontSize: 15 },
  description: { color: "rgba(255,255,255,0.75)", fontSize: 14, lineHeight: 19, marginTop: 2 },
  socialRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 12, marginTop: 4 },
  going: { color: colors.white, fontSize: 14, fontWeight: "700" },
  goingLabel: { color: "rgba(255,255,255,0.7)", fontWeight: "400" },
  avatars: { flexDirection: "row", alignItems: "center" },
  avatarWrap: {},
  avatar: { width: 26, height: 26, borderRadius: 13, borderWidth: 2, borderColor: "rgba(0,0,0,0.45)" },
  avatarFallback: { backgroundColor: colors.accentFrom, alignItems: "center", justifyContent: "center" },
  avatarMore: { backgroundColor: "rgba(255,255,255,0.25)", alignItems: "center", justifyContent: "center", minWidth: 26, paddingHorizontal: 4 },
  avatarInitial: { color: colors.white, fontSize: 10, fontWeight: "700" },
  friendsChip: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "rgba(255,255,255,0.18)", borderRadius: radius.full, paddingHorizontal: 10, paddingVertical: 3 },
  friendsText: { color: colors.white, fontSize: 12, fontWeight: "700" },
  rating: { color: "#fcd34d", fontSize: 13, fontWeight: "700" },
  stamp: { position: "absolute", top: 110, borderWidth: 4, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 4 },
  stampPass: { left: spacing.lg, borderColor: "#f43f5e", transform: [{ rotate: "-12deg" }] },
  stampOpen: { right: spacing.lg, borderColor: "#34d399", transform: [{ rotate: "12deg" }] },
  stampText: { fontSize: 24, fontWeight: "800", textTransform: "uppercase" },
});
