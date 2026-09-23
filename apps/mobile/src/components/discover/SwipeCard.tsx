import { useRef } from "react";
import { Animated, Dimensions, Image, PanResponder, StyleSheet, Text, View } from "react-native";
import type { EventCard } from "../../lib/event-types";
import { colors, radius, spacing } from "../../lib/theme";

const SCREEN_WIDTH = Dimensions.get("window").width;
const SWIPE_THRESHOLD = SCREEN_WIDTH * 0.28;

/**
 * UX §65/§66 — swipe left => PASS, swipe right/tap => OPEN. Built on core
 * RN `Animated` + `PanResponder` (no reanimated worklets) to keep the gesture
 * layer simple and avoid a dependency this environment can't test on a real
 * device/simulator.
 */
export function SwipeCard({
  event,
  onPass,
  onOpen,
  isTop,
}: {
  event: EventCard;
  onPass: () => void;
  onOpen: () => void;
  isTop: boolean;
}) {
  const pan = useRef(new Animated.ValueXY()).current;
  const rotate = pan.x.interpolate({ inputRange: [-SCREEN_WIDTH, 0, SCREEN_WIDTH], outputRange: ["-12deg", "0deg", "12deg"] });

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gesture) => isTop && (Math.abs(gesture.dx) > 6 || Math.abs(gesture.dy) > 6),
      onPanResponderMove: Animated.event([null, { dx: pan.x, dy: pan.y }], { useNativeDriver: false }),
      onPanResponderRelease: (_, gesture) => {
        if (gesture.dx > SWIPE_THRESHOLD) {
          Animated.timing(pan, { toValue: { x: SCREEN_WIDTH * 1.5, y: gesture.dy }, duration: 200, useNativeDriver: false }).start(onOpen);
          return;
        }
        if (gesture.dx < -SWIPE_THRESHOLD) {
          Animated.timing(pan, { toValue: { x: -SCREEN_WIDTH * 1.5, y: gesture.dy }, duration: 200, useNativeDriver: false }).start(onPass);
          return;
        }
        Animated.spring(pan, { toValue: { x: 0, y: 0 }, useNativeDriver: false }).start();
      },
    }),
  ).current;

  const cover = event.media[0];

  return (
    <Animated.View
      {...(isTop ? panResponder.panHandlers : {})}
      style={[styles.card, isTop && { transform: [...pan.getTranslateTransform(), { rotate }] }]}
    >
      {cover ? (
        <Image source={{ uri: cover.displayUrl }} style={styles.image} resizeMode="cover" />
      ) : (
        <View style={[styles.image, styles.placeholder]} />
      )}
      <View style={styles.overlay}>
        <Text style={styles.title} numberOfLines={2}>
          {event.title}
        </Text>
        <Text style={styles.subtitle} numberOfLines={1}>
          {[event.city?.nameUk, event.category?.nameUk].filter(Boolean).join(" · ")}
        </Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    position: "absolute",
    width: "100%",
    aspectRatio: 3 / 4,
    borderRadius: radius.lg,
    overflow: "hidden",
    backgroundColor: colors.surface,
  },
  image: { width: "100%", height: "100%" },
  placeholder: { backgroundColor: colors.surface },
  overlay: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    padding: spacing.lg,
    backgroundColor: "rgba(11,11,18,0.75)",
    gap: 2,
  },
  title: { color: colors.white, fontSize: 20, fontWeight: "700" },
  subtitle: { color: colors.muted, fontSize: 13 },
});
