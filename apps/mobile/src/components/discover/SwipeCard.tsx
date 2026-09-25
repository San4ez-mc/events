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
  stamp: { position: "absolute", top: 110, borderWidth: 4, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 4 },
  stampPass: { left: spacing.lg, borderColor: "#f43f5e", transform: [{ rotate: "-12deg" }] },
  stampOpen: { right: spacing.lg, borderColor: "#34d399", transform: [{ rotate: "12deg" }] },
  stampText: { fontSize: 24, fontWeight: "800", textTransform: "uppercase" },
});
