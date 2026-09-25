import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, radius, spacing } from "../../lib/theme";

type IconName = React.ComponentProps<typeof Ionicons>["name"];

/** Tab-screen title that clears the status bar / notch (insets.top) — used by every tab so titles never sit under the clock. */
export function ScreenHeader({ title, subtitle, icon }: { title: string; subtitle?: string; icon: IconName }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.wrap, { paddingTop: insets.top + spacing.lg }]}>
      <View style={styles.badge}>
        <Ionicons name={icon} size={24} color={colors.white} />
      </View>
      <View style={styles.texts}>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
    </View>
  );
}

/** Centered icon + message for empty lists / hints. */
export function EmptyState({ icon, title, text }: { icon: IconName; title?: string; text: string }) {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}>
        <Ionicons name={icon} size={44} color={colors.accentFrom} />
      </View>
      {title ? <Text style={styles.emptyTitle}>{title}</Text> : null}
      <Text style={styles.emptyText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingBottom: spacing.md },
  badge: {
    width: 46,
    height: 46,
    borderRadius: radius.lg,
    backgroundColor: colors.accentFrom,
    alignItems: "center",
    justifyContent: "center",
  },
  texts: { flex: 1, gap: 2 },
  title: { color: colors.foreground, fontSize: 28, fontWeight: "800" },
  subtitle: { color: colors.muted, fontSize: 13 },
  empty: { alignItems: "center", gap: spacing.md, paddingTop: 72, paddingHorizontal: spacing.xl },
  emptyIcon: {
    width: 92,
    height: 92,
    borderRadius: 46,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTitle: { color: colors.foreground, fontSize: 18, fontWeight: "700", textAlign: "center" },
  emptyText: { color: colors.muted, fontSize: 14, textAlign: "center", lineHeight: 20 },
});
