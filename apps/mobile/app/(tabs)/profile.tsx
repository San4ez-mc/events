import { StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { useAuth } from "../../src/lib/auth-context";
import { useTranslations } from "../../src/lib/locale-context";
import { Button } from "../../src/components/ui/Button";
import { colors, spacing } from "../../src/lib/theme";

export default function ProfileScreen() {
  const { user, logout } = useAuth();
  const { t, locale, setLocale } = useTranslations();

  async function handleLogout() {
    await logout();
    router.replace("/login");
  }

  if (!user) return null;

  return (
    <View style={styles.container}>
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{(user.name ?? user.nickname ?? user.email).slice(0, 1).toUpperCase()}</Text>
      </View>
      <Text style={styles.name}>{user.name ?? user.nickname ?? user.email}</Text>
      <Text style={styles.email}>{user.email}</Text>

      <View style={styles.actions}>
        <Button
          title={locale === "uk" ? "English" : "Українська"}
          variant="secondary"
          onPress={() => setLocale(locale === "uk" ? "en" : "uk")}
        />
        <Button title={t("auth.logout")} variant="danger" onPress={() => void handleLogout()} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, alignItems: "center", padding: spacing.xl, gap: spacing.sm },
  avatar: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: colors.accentFrom,
    alignItems: "center",
    justifyContent: "center",
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
  },
  avatarText: { color: colors.white, fontSize: 32, fontWeight: "700" },
  name: { color: colors.foreground, fontSize: 20, fontWeight: "700" },
  email: { color: colors.muted, fontSize: 14, marginBottom: spacing.xl },
  actions: { width: "100%", gap: spacing.sm, marginTop: spacing.xl },
});
