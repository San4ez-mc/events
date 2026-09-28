import { useEffect, useMemo, useRef, useState } from "react";
import { Animated, Dimensions, Modal, PanResponder, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslations } from "../../lib/locale-context";
import { radius, spacing, type Palette, useThemedStyles } from "../../lib/theme";

type IconName = React.ComponentProps<typeof Ionicons>["name"];
type Target = "undo" | "pass" | "save" | "open" | "share" | "filters";
type Step = { kind: "swipe"; dir: "left" | "right" } | { kind: "tap"; target: Target } | { kind: "done" };

const STEPS: Step[] = [
  { kind: "swipe", dir: "left" },
  { kind: "swipe", dir: "right" },
  { kind: "tap", target: "pass" },
  { kind: "tap", target: "save" },
  { kind: "tap", target: "open" },
  { kind: "tap", target: "undo" },
  { kind: "tap", target: "share" },
  { kind: "tap", target: "filters" },
  { kind: "done" },
];

// Must mirror the real feed layout (app/(tabs)/index.tsx) so the highlighted mock buttons sit exactly over the real ones.
const ACTIONS_HEIGHT = 72;
const ACTIONS_MARGIN = 20;
const SCREEN_WIDTH = Dimensions.get("window").width;
const SWIPE_DISTANCE = SCREEN_WIDTH * 0.14;
const FLICK_VELOCITY = 0.3;

const TARGET_ICON: Record<Target, { icon: IconName; color: string }> = {
  pass: { icon: "close", color: "#f43f5e" },
  save: { icon: "heart-outline", color: "#ec4899" },
  open: { icon: "arrow-forward", color: "#34d399" },
  undo: { icon: "arrow-undo", color: "#f59e0b" },
  share: { icon: "share-social-outline", color: "#ffffff" },
  filters: { icon: "options-outline", color: "#ffffff" },
};

/** Interactive first-run tour: the user really swipes a demo card both ways, then taps each button once. */
export function FeedTutorial({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { styles } = useThemedStyles(makeStyles);
  const { t } = useTranslations();
  const insets = useSafeAreaInsets();
  const [index, setIndex] = useState(0);
  const [praise, setPraise] = useState(false);
  const step = STEPS[index]!;

  useEffect(() => {
    if (visible) {
      setIndex(0);
      setPraise(false);
    }
  }, [visible]);

  function next() {
    setPraise(false);
    setIndex((i) => Math.min(STEPS.length - 1, i + 1));
  }

  /** Shows a short "well done" before moving on, so the user sees their gesture was recognised. */
  function completed() {
    setPraise(true);
    setTimeout(next, 750);
  }

  const title =
    step.kind === "swipe" ? t(`tutorial.swipe_${step.dir}_title`) : step.kind === "tap" ? t(`tutorial.tap_${step.target}_title`) : t("tutorial.done_title");
  const text =
    step.kind === "swipe" ? t(`tutorial.swipe_${step.dir}_text`) : step.kind === "tap" ? t(`tutorial.tap_${step.target}_text`) : t("tutorial.done_text");

  const headerTargets: Target[] = ["share", "filters"];
  const isTap = step.kind === "tap";
  const active = step.kind === "tap" ? step.target : null;

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        {/* Top row: progress + skip. box-none — its own padding area must not swallow taps meant for the
            mock header buttons (share/filters), which sit visually inside this row's bounding box. */}
        <View pointerEvents="box-none" style={[styles.topRow, { paddingTop: insets.top + spacing.sm + 42 + spacing.md }]}>
          <View style={styles.dots}>
            {STEPS.map((_, i) => (
              <View key={i} style={[styles.dot, i === index && styles.dotOn, i < index && styles.dotDone]} />
            ))}
          </View>
          {step.kind !== "done" && (
            <Pressable onPress={onClose} hitSlop={10} style={styles.skip}>
              <Text style={styles.skipText}>{t("tutorial.skip")}</Text>
            </Pressable>
          )}
        </View>

        {/* Mock header buttons (real positions) */}
        {isTap && (
          <View style={[styles.mockHeader, { paddingTop: insets.top + spacing.sm }]} pointerEvents="box-none">
            <View style={{ flex: 1 }} />
            <View style={styles.mockHeaderActions}>
              {headerTargets.map((target) => (
                <MockButton key={target} target={target} size={42} active={active === target} onPress={next} />
              ))}
            </View>
          </View>
        )}

        {/* Explanation */}
        <View style={styles.center} pointerEvents="box-none">
          <View style={styles.card}>
            <Text style={styles.title}>{praise ? t("tutorial.praise") : title}</Text>
            <Text style={styles.text}>{praise ? t(`tutorial.praise_${step.kind === "swipe" ? step.dir : "tap"}`) : text}</Text>
          </View>

          {step.kind === "swipe" && <DemoCard key={step.dir} dir={step.dir} disabled={praise} onDone={completed} />}
          {step.kind === "swipe" && !praise && <Text style={styles.hint}>{t("tutorial.swipeHint")}</Text>}
          {isTap && <Text style={styles.hint}>{t("tutorial.tapHint")}</Text>}

          {step.kind === "done" && (
            <Pressable onPress={onClose} style={styles.primary}>
              <Text style={styles.primaryText}>{t("tutorial.start")}</Text>
            </Pressable>
          )}
        </View>

        {/* Mock action bar (real positions) */}
        {isTap && (
          <View style={[styles.mockActions, { bottom: ACTIONS_MARGIN }]} pointerEvents="box-none">
            <MockButton target="undo" size={48} active={active === "undo"} onPress={next} />
            <MockButton target="pass" size={64} active={active === "pass"} onPress={next} />
            <MockButton target="save" size={64} active={active === "save"} onPress={next} />
            <MockButton target="open" size={48} active={active === "open"} onPress={next} />
          </View>
        )}
      </View>
    </Modal>
  );
}

/** A button copy: dimmed and inert unless it is the one to tap; the active one pulses. */
function MockButton({ target, size, active, onPress }: { target: Target; size: number; active: boolean; onPress: () => void }) {
  const { styles } = useThemedStyles(makeStyles);
  const pulse = useRef(new Animated.Value(0)).current;
  const { icon, color } = TARGET_ICON[target];

  useEffect(() => {
    if (!active) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [active, pulse]);

  const ringScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.35] });
  const ringOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.9, 0] });

  return (
    <View style={{ width: size, height: size }}>
      {active && <Animated.View pointerEvents="none" style={[styles.ring, { borderRadius: size, opacity: ringOpacity, transform: [{ scale: ringScale }] }]} />}
      <Pressable
        disabled={!active}
        onPress={onPress}
        style={[styles.round, { width: size, height: size, borderRadius: size / 2 }, active ? styles.roundActive : { opacity: 0.28 }]}
        accessibilityLabel={target}
      >
        <Ionicons name={icon} size={size * 0.5} color={color} />
      </Pressable>
    </View>
  );
}

/** A practice card the user must drag in the requested direction (short drag or a flick is enough, like the real feed). */
function DemoCard({ dir, onDone, disabled }: { dir: "left" | "right"; onDone: () => void; disabled: boolean }) {
  const { styles } = useThemedStyles(makeStyles);
  const { t } = useTranslations();
  const pan = useRef(new Animated.ValueXY()).current;
  const nudge = useRef(new Animated.Value(0)).current;
  const touched = useRef(false);
  const doneRef = useRef(onDone);
  const disabledRef = useRef(disabled);
  doneRef.current = onDone;
  disabledRef.current = disabled;
  const sign = dir === "left" ? -1 : 1;

  // A gentle wiggle towards the required side until the finger touches the card.
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(nudge, { toValue: sign * 26, duration: 650, useNativeDriver: false }),
        Animated.timing(nudge, { toValue: 0, duration: 650, useNativeDriver: false }),
        Animated.delay(500),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [nudge, sign]);

  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => !disabledRef.current,
        onMoveShouldSetPanResponder: () => !disabledRef.current,
        onPanResponderGrant: () => {
          touched.current = true;
          nudge.stopAnimation();
          nudge.setValue(0);
        },
        onPanResponderMove: Animated.event([null, { dx: pan.x, dy: pan.y }], { useNativeDriver: false }),
        onPanResponderRelease: (_, g) => {
          const enough = (g.dx * sign > SWIPE_DISTANCE) || (g.vx * sign > FLICK_VELOCITY);
          if (enough) {
            Animated.timing(pan, { toValue: { x: sign * SCREEN_WIDTH, y: g.dy }, duration: 160, useNativeDriver: false }).start(() => doneRef.current());
          } else {
            Animated.spring(pan, { toValue: { x: 0, y: 0 }, useNativeDriver: false }).start();
          }
        },
      }),
    [nudge, pan, sign],
  );

  const x = Animated.add(pan.x, nudge);
  const rotate = pan.x.interpolate({ inputRange: [-SCREEN_WIDTH, 0, SCREEN_WIDTH], outputRange: ["-10deg", "0deg", "10deg"] });
  const stampOpacity = pan.x.interpolate({ inputRange: sign < 0 ? [-SWIPE_DISTANCE, 0] : [0, SWIPE_DISTANCE], outputRange: sign < 0 ? [1, 0] : [0, 1], extrapolate: "clamp" });
  const stampColor = dir === "left" ? "#f43f5e" : "#34d399";

  return (
    <Animated.View {...responder.panHandlers} style={[styles.demo, { transform: [{ translateX: x }, { translateY: pan.y }, { rotate }] }]}>
      <Ionicons name="calendar" size={54} color="rgba(255,255,255,0.9)" />
      <Text style={styles.demoTitle}>{t("tutorial.demoTitle")}</Text>
      <Text style={styles.demoMeta}>{t("tutorial.demoMeta")}</Text>
      <Animated.View style={[styles.stamp, dir === "left" ? styles.stampLeft : styles.stampRight, { opacity: stampOpacity, borderColor: stampColor }]}>
        <Text style={[styles.stampText, { color: stampColor }]}>{dir === "left" ? t("discover.pass") : t("discover.open")}</Text>
      </Animated.View>
    </Animated.View>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(8,8,14,0.94)" },
  topRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, zIndex: 5 },
  dots: { flexDirection: "row", gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "rgba(255,255,255,0.22)" },
  dotOn: { backgroundColor: colors.accentFrom, width: 22 },
  dotDone: { backgroundColor: "rgba(255,255,255,0.6)" },
  skip: { paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radius.full, backgroundColor: "rgba(255,255,255,0.12)" },
  skipText: { color: colors.white, fontSize: 13, fontWeight: "700" },
  mockHeader: { position: "absolute", top: 0, left: 0, right: 0, paddingHorizontal: spacing.lg, flexDirection: "row", alignItems: "center", zIndex: 4 },
  mockHeaderActions: { flexDirection: "row", gap: spacing.sm },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.lg, paddingHorizontal: spacing.xl },
  card: { alignItems: "center", gap: spacing.sm },
  title: { color: colors.white, fontSize: 24, fontWeight: "800", textAlign: "center" },
  text: { color: "rgba(255,255,255,0.78)", fontSize: 15, lineHeight: 21, textAlign: "center" },
  hint: { color: "rgba(255,255,255,0.5)", fontSize: 13, textAlign: "center" },
  primary: { backgroundColor: colors.accentFrom, borderRadius: radius.full, paddingHorizontal: spacing.xxl, paddingVertical: spacing.md },
  primaryText: { color: colors.white, fontSize: 16, fontWeight: "800" },
  mockActions: { position: "absolute", left: 0, right: 0, height: ACTIONS_HEIGHT, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.lg },
  round: { alignItems: "center", justifyContent: "center", backgroundColor: "rgba(28,28,40,0.95)", borderWidth: 1, borderColor: "rgba(255,255,255,0.18)" },
  roundActive: { borderColor: colors.accentFrom, borderWidth: 2 },
  ring: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, borderWidth: 3, borderColor: colors.accentFrom },
  demo: {
    width: SCREEN_WIDTH * 0.66,
    height: 230,
    borderRadius: 22,
    backgroundColor: colors.accentFrom,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    shadowColor: "#000",
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 10,
  },
  demoTitle: { color: colors.white, fontSize: 20, fontWeight: "800" },
  demoMeta: { color: "rgba(255,255,255,0.8)", fontSize: 13 },
  stamp: { position: "absolute", top: 18, borderWidth: 3, borderRadius: radius.md, paddingHorizontal: 10, paddingVertical: 2 },
  stampLeft: { left: 14, transform: [{ rotate: "-12deg" }] },
  stampRight: { right: 14, transform: [{ rotate: "12deg" }] },
  stampText: { fontSize: 18, fontWeight: "800", textTransform: "uppercase" },
});
