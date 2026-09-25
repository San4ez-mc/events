import { useEffect, useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { API_URL, getAccessToken } from "../../src/lib/api-client";
import { useAuth } from "../../src/lib/auth-context";
import { useTranslations } from "../../src/lib/locale-context";
import { Button } from "../../src/components/ui/Button";
import { TextField } from "../../src/components/ui/TextField";
import { ScreenHeader } from "../../src/components/ui/ScreenHeader";
import { colors, radius, spacing } from "../../src/lib/theme";

interface FullProfile {
  name: string | null;
  nickname: string | null;
  bio: string | null;
  phone: string | null;
  email: string;
}

export default function ProfileScreen() {
  const { user, logout } = useAuth();
  const { t, locale, setLocale } = useTranslations();

  const [form, setForm] = useState({ name: "", nickname: "", bio: "", phone: "" });
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    const token = getAccessToken();
    if (!token) return;
    void (async () => {
      const res = await fetch(`${API_URL}/api/v1/users/me`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) return;
      const me = (await res.json()) as FullProfile;
      setForm({ name: me.name ?? "", nickname: me.nickname ?? "", bio: me.bio ?? "", phone: me.phone ?? "" });
      setLoaded(true);
    })().catch(() => setLoaded(true));
  }, []);

  async function handleLogout() {
    await logout();
    router.replace("/login");
  }

  async function handleSave() {
    const token = getAccessToken();
    if (!token) return;
    setSaving(true);
    setMessage(null);
    // Only send filled fields: the API validates length/format, empty strings would fail it.
    const body: Record<string, string> = { locale };
    for (const [key, value] of Object.entries(form)) if (value.trim()) body[key] = value.trim();
    try {
      const res = await fetch(`${API_URL}/api/v1/users/me`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      setMessage(res.ok ? { ok: true, text: t("profile.saved") } : { ok: false, text: t("profile.saveFailed") });
    } catch {
      setMessage({ ok: false, text: t("common.somethingWentWrong") });
    } finally {
      setSaving(false);
    }
  }

  function confirmLogout() {
    Alert.alert(t("auth.logout"), undefined, [
      { text: t("common.cancel"), style: "cancel" },
      { text: t("auth.logout"), style: "destructive", onPress: () => void handleLogout() },
    ]);
  }

  if (!user) return null;
  const initial = (form.name || user.name || user.nickname || user.email).slice(0, 1).toUpperCase();

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView style={styles.flex} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <ScreenHeader title={t("nav.profile")} subtitle={t("screens.profileSubtitle")} icon="person" />

        <View style={styles.card}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initial}</Text>
          </View>
          <View style={styles.cardText}>
            <Text style={styles.name}>{form.name || user.name || user.nickname || user.email}</Text>
            <Text style={styles.email}>{user.email}</Text>
          </View>
        </View>

        <Text style={styles.section}>{t("profile.about")}</Text>
        <View style={styles.form}>
          <TextField label={t("auth.register.name")} value={form.name} onChangeText={(v) => setForm((f) => ({ ...f, name: v }))} />
          <TextField label={t("auth.register.nickname")} value={form.nickname} onChangeText={(v) => setForm((f) => ({ ...f, nickname: v }))} />
          <TextField label={t("profile.phone")} value={form.phone} onChangeText={(v) => setForm((f) => ({ ...f, phone: v }))} />
          <Text style={styles.hint}>{t("profile.phoneHint")}</Text>
          <TextField label={t("profile.bio")} value={form.bio} onChangeText={(v) => setForm((f) => ({ ...f, bio: v }))} multiline />
          {message && <Text style={[styles.message, { color: message.ok ? colors.success : colors.danger }]}>{message.text}</Text>}
          <Button title={t("common.save")} onPress={() => void handleSave()} loading={saving} disabled={!loaded} />
        </View>

        <Pressable style={styles.row} onPress={() => router.push("/my-events")}>
          <Ionicons name="ticket" size={22} color={colors.accentFrom} />
          <View style={{ flex: 1 }}>
            <Text style={styles.rowText}>{t("myEvents.open")}</Text>
            <Text style={styles.rowHint}>{t("myEvents.openHint")}</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.muted} />
        </Pressable>

        <Text style={styles.section}>{t("profile.settings")}</Text>
        <Pressable style={styles.row} onPress={() => setLocale(locale === "uk" ? "en" : "uk")}>
          <Ionicons name="language" size={22} color={colors.accentFrom} />
          <Text style={styles.rowText}>{t("profile.language")}</Text>
          <Text style={styles.rowValue}>{locale === "uk" ? "Українська" : "English"}</Text>
        </Pressable>
        <Pressable style={styles.row} onPress={confirmLogout}>
          <Ionicons name="log-out-outline" size={22} color={colors.danger} />
          <Text style={[styles.rowText, { color: colors.danger }]}>{t("auth.logout")}</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md },
  card: { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg },
  avatar: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.accentFrom, alignItems: "center", justifyContent: "center" },
  avatarText: { color: colors.white, fontSize: 26, fontWeight: "800" },
  cardText: { flex: 1, gap: 2 },
  name: { color: colors.foreground, fontSize: 18, fontWeight: "700" },
  email: { color: colors.muted, fontSize: 13 },
  section: { color: colors.muted, fontSize: 12, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.8, marginTop: spacing.md },
  form: { gap: spacing.md },
  hint: { color: colors.muted, fontSize: 12, marginTop: -spacing.sm },
  message: { fontSize: 14 },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.lg },
  rowText: { color: colors.foreground, fontSize: 15, fontWeight: "600", flex: 1 },
  rowHint: { color: colors.muted, fontSize: 12 },
  rowValue: { color: colors.muted, fontSize: 14 },
});
