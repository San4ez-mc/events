import type { ReactNode } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, radius, spacing } from "../../lib/theme";

type Icon = React.ComponentProps<typeof Ionicons>["name"];

const DECOR: { icon: Icon; style: { top?: number | `${number}%`; bottom?: number | `${number}%`; left?: `${number}%`; right?: `${number}%` }; size: number; rotate: string }[] = [
  { icon: "balloon", style: { top: "5%", left: "6%" }, size: 54, rotate: "-12deg" },
  { icon: "musical-notes", style: { top: "9%", right: "8%" }, size: 46, rotate: "10deg" },
  { icon: "game-controller", style: { top: "36%", left: "3%" }, size: 58, rotate: "8deg" },
  { icon: "pizza", style: { top: "40%", right: "4%" }, size: 52, rotate: "-8deg" },
  { icon: "bicycle", style: { bottom: "10%", left: "7%" }, size: 54, rotate: "12deg" },
  { icon: "camera", style: { bottom: "8%", right: "9%" }, size: 46, rotate: "-10deg" },
  { icon: "sparkles", style: { top: "22%", left: "44%" }, size: 34, rotate: "0deg" },
  { icon: "ticket", style: { bottom: "22%", right: "40%" }, size: 40, rotate: "-6deg" },
];

/**
 * Playful backdrop for login / register (UX §48: the product should feel
 * fun, not like a form): soft gradient blobs + scattered activity icons.
 * Drop a real photo as `assets/auth-bg.jpg` later and wire it in as the bottom layer.
 */
export function AuthBackdrop({ children }: { children: ReactNode }) {
  return (
    <View style={styles.root}>
      <View style={[styles.blob, { top: -80, left: -90, backgroundColor: colors.accentFrom }]} />
      <View style={[styles.blob, { bottom: -100, right: -90, backgroundColor: colors.accentTo }]} />
      {DECOR.map((d) => (
        <Ionicons key={d.icon} name={d.icon} size={d.size} color={colors.accentFrom} style={[styles.decor, d.style, { transform: [{ rotate: d.rotate }] }]} />
      ))}
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.card}>{children}</View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background, overflow: "hidden" },
  flex: { flex: 1 },
  blob: { position: "absolute", width: 300, height: 300, borderRadius: 150, opacity: 0.22 },
  decor: { position: "absolute", opacity: 0.28 },
  scroll: { flexGrow: 1, justifyContent: "center", padding: spacing.xl },
  card: { backgroundColor: "rgba(22,22,31,0.86)", borderRadius: radius.lg + 10, padding: spacing.xl, gap: spacing.xl, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)" },
});
