import { useEffect, useRef } from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, radius, spacing } from "../../lib/theme";

type IconName = React.ComponentProps<typeof Ionicons>["name"];

export interface ToastData {
  /** Changes for every new toast so the animation restarts, even for the same text twice in a row. */
  id: number;
  icon: IconName;
  color: string;
  text: string;
  actionLabel?: string;
  onAction?: () => void;
}

const VISIBLE_MS = 2200;

/** Short "what just happened" banner shown after a swipe or a button (pass / save / undo …). Optional action, e.g. Undo. */
export function ActionToast({ toast, top }: { toast: ToastData | null; top: number }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const lift = useRef(new Animated.Value(-8)).current;
  const running = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    if (!toast) return;
    running.current?.stop();
    opacity.setValue(0);
    lift.setValue(-8);
    running.current = Animated.sequence([
      Animated.parallel([
        Animated.timing(opacity, { toValue: 1, duration: 160, useNativeDriver: true }),
        Animated.timing(lift, { toValue: 0, duration: 160, useNativeDriver: true }),
      ]),
      Animated.delay(VISIBLE_MS),
      Animated.timing(opacity, { toValue: 0, duration: 260, useNativeDriver: true }),
    ]);
    running.current.start();
    return () => running.current?.stop();
  }, [toast?.id, opacity, lift, toast]);

  if (!toast) return null;

  return (
    <Animated.View pointerEvents="box-none" style={[styles.wrap, { top, opacity, transform: [{ translateY: lift }] }]}>
      <View style={styles.pill}>
        <Ionicons name={toast.icon} size={22} color={toast.color} />
        <Text style={styles.text} numberOfLines={2}>
          {toast.text}
        </Text>
        {toast.actionLabel && toast.onAction ? (
          <Pressable onPress={toast.onAction} hitSlop={10} style={styles.action}>
            <Text style={styles.actionText}>{toast.actionLabel}</Text>
          </Pressable>
        ) : null}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: "absolute", left: spacing.lg, right: spacing.lg, alignItems: "center", zIndex: 20 },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    maxWidth: "100%",
    backgroundColor: "rgba(15,15,24,0.92)",
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
    paddingLeft: spacing.md,
    paddingRight: spacing.lg,
    paddingVertical: spacing.sm + 2,
  },
  text: { color: colors.white, fontSize: 14, fontWeight: "600", flexShrink: 1 },
  action: { marginLeft: spacing.xs, paddingHorizontal: spacing.md, paddingVertical: 4, borderRadius: radius.full, backgroundColor: "rgba(255,255,255,0.14)" },
  actionText: { color: colors.white, fontSize: 13, fontWeight: "800" },
});
