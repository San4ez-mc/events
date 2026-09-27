import { useEffect, useState } from "react";
import { Alert, Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { API_URL, getAccessToken, refreshAccessToken } from "../../src/lib/api-client";
import { ApiRequestError, useAuth } from "../../src/lib/auth-context";
import { useTranslations } from "../../src/lib/locale-context";
import { formatPhoneInput } from "../../src/lib/format";
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
  avatarUrl: string | null;
}

// A long profile session can outlive the short-lived access token; refresh once and retry
// instead of failing the save/upload for what's really just an expired session.
async function authed<T = unknown>(path: string, init: RequestInit = {}, retried = false): Promise<T> {
  const token = getAccessToken();
  const res = await fetch(`${API_URL}/api/v1${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token ?? ""}`, ...(init.body && !(init.body instanceof FormData) ? { "Content-Type": "application/json" } : {}), ...init.headers },
  });
  if (res.status === 401 && !retried) {
    const refreshed = await refreshAccessToken();
    if (refreshed) return authed<T>(path, init, true);
  }
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new ApiRequestError(body ?? {});
  return body as T;
}

export default function ProfileScreen() {
  const { user, logout } = useAuth();
  const { t, locale, setLocale } = useTranslations();

  const [form, setForm] = useState({ name: "", nickname: "", bio: "", phone: "" });
  const [email, setEmail] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const [pwCurrent, setPwCurrent] = useState("");
  const [pwNew, setPwNew] = useState("");
  const [pwSaving, setPwSaving] = useState(false);
  const [pwMessage, setPwMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const [newEmail, setNewEmail] = useState("");
  const [emailPassword, setEmailPassword] = useState("");
  const [emailSaving, setEmailSaving] = useState(false);
  const [emailMessage, setEmailMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    const token = getAccessToken();
    if (!token) return;
    void (async () => {
      const res = await fetch(`${API_URL}/api/v1/users/me`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) return;
      const me = (await res.json()) as FullProfile;
      setForm({ name: me.name ?? "", nickname: me.nickname ?? "", bio: me.bio ?? "", phone: me.phone ?? "" });
      setEmail(me.email);
      setAvatarUrl(me.avatarUrl);
      setLoaded(true);
    })().catch(() => setLoaded(true));
  }, []);

  async function handleLogout() {
    await logout();
    router.replace("/login");
  }

  async function handleSave() {
    setSaving(true);
    setMessage(null);
    // Only send filled fields: the API validates length/format, empty strings would fail it.
    const body: Record<string, string> = { locale };
    for (const [key, value] of Object.entries(form)) if (value.trim()) body[key] = value.trim();
    try {
      await authed("/users/me", { method: "PATCH", body: JSON.stringify(body) });
      setMessage({ ok: true, text: t("profile.saved") });
    } catch (err) {
      setMessage({ ok: false, text: err instanceof ApiRequestError ? t(`errors.${err.code}`) : t("profile.saveFailed") });
    } finally {
      setSaving(false);
    }
  }

  async function pickAvatar() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.9, allowsEditing: true, aspect: [1, 1] });
    const asset = result.canceled ? null : result.assets[0];
    if (!asset) return;
    setAvatarUploading(true);
    setMessage(null);
    try {
      const data = new FormData();
      // RN's fetch/FormData accepts this shape for a file part; it is not a real Blob/File.
      data.append("file", { uri: asset.uri, name: "avatar.jpg", type: "image/jpeg" } as unknown as Blob);
      const body = await authed<{ avatarUrl: string }>("/users/me/avatar", { method: "POST", body: data });
      setAvatarUrl(body.avatarUrl);
    } catch (err) {
      setMessage({ ok: false, text: err instanceof ApiRequestError ? t(`errors.${err.code}`) : t("common.somethingWentWrong") });
    } finally {
      setAvatarUploading(false);
    }
  }

  async function handleChangePassword() {
    setPwSaving(true);
    setPwMessage(null);
    try {
      await authed("/users/me/password", { method: "POST", body: JSON.stringify({ currentPassword: pwCurrent, newPassword: pwNew }) });
      setPwMessage({ ok: true, text: t("profile.passwordChanged") });
      setPwCurrent("");
      setPwNew("");
    } catch (err) {
      setPwMessage({ ok: false, text: err instanceof ApiRequestError ? t(`errors.${err.code}`) : t("common.somethingWentWrong") });
    } finally {
      setPwSaving(false);
    }
  }

  async function handleChangeEmail() {
    setEmailSaving(true);
    setEmailMessage(null);
    try {
      await authed("/users/me/email", { method: "POST", body: JSON.stringify({ newEmail: newEmail.trim(), currentPassword: emailPassword }) });
      setEmail(newEmail.trim());
      setNewEmail("");
      setEmailPassword("");
      setEmailMessage({ ok: true, text: t("profile.emailChangedCheckInbox") });
    } catch (err) {
      setEmailMessage({ ok: false, text: err instanceof ApiRequestError ? t(`errors.${err.code}`) : t("common.somethingWentWrong") });
    } finally {
      setEmailSaving(false);
    }
  }

  function confirmLogout() {
    Alert.alert(t("auth.logout"), undefined, [
      { text: t("common.cancel"), style: "cancel" },
      { text: t("auth.logout"), style: "destructive", onPress: () => void handleLogout() },
    ]);
  }

  function confirmDeleteAccount() {
    Alert.alert(t("profile.deleteAccount"), t("profile.deleteAccountConfirm"), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("profile.deleteAccountYes"),
        style: "destructive",
        onPress: () =>
          void (async () => {
            try {
              await authed("/users/me", { method: "DELETE", body: JSON.stringify({ confirm: true }) });
              await logout();
              router.replace("/login");
            } catch (err) {
              setMessage({ ok: false, text: err instanceof ApiRequestError ? t(`errors.${err.code}`) : t("common.somethingWentWrong") });
            }
          })(),
      },
    ]);
  }

  if (!user) return null;
  const initial = (form.name || user.name || user.nickname || email || user.email).slice(0, 1).toUpperCase();

  return (
    // Android needs "height" (not the no-op `undefined`) to actually shrink space for the keyboard.
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : "height"}>
      <ScrollView style={styles.flex} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <ScreenHeader title={t("nav.profile")} subtitle={t("screens.profileSubtitle")} icon="person" />

        <View style={styles.card}>
          <Pressable onPress={() => void pickAvatar()} disabled={avatarUploading} accessibilityLabel={t("profile.changePhoto")}>
            <View style={styles.avatar}>
              {avatarUrl ? <Image source={{ uri: avatarUrl }} style={styles.avatarImage} /> : <Text style={styles.avatarText}>{initial}</Text>}
            </View>
            <View style={styles.avatarBadge}>
              <Ionicons name="camera" size={13} color={colors.white} />
            </View>
          </Pressable>
          <View style={styles.cardText}>
            <Text style={styles.name}>{form.name || user.name || user.nickname || email}</Text>
            <Text style={styles.email}>{email}</Text>
          </View>
        </View>

        <Text style={styles.section}>{t("profile.about")}</Text>
        <View style={styles.form}>
          <TextField label={t("auth.register.name")} value={form.name} onChangeText={(v) => setForm((f) => ({ ...f, name: v }))} />
          <TextField label={t("auth.register.nickname")} value={form.nickname} onChangeText={(v) => setForm((f) => ({ ...f, nickname: v }))} />
          <TextField
            label={t("profile.phone")}
            value={form.phone}
            onChangeText={(v) => setForm((f) => ({ ...f, phone: formatPhoneInput(v) }))}
            keyboardType="phone-pad"
          />
          <Text style={styles.hint}>{t("profile.phoneHint")}</Text>
          <TextField label={t("profile.bio")} value={form.bio} onChangeText={(v) => setForm((f) => ({ ...f, bio: v }))} multiline />
          {message && <Text style={[styles.message, { color: message.ok ? colors.success : colors.danger }]}>{message.text}</Text>}
          <Button title={t("common.save")} onPress={() => void handleSave()} loading={saving} disabled={!loaded} />
        </View>

        <Text style={styles.section}>{t("profile.security")}</Text>
        <View style={styles.form}>
          <TextField label={t("profile.changeEmail")} value={newEmail} onChangeText={setNewEmail} keyboardType="email-address" autoCapitalize="none" placeholder={email} />
          <TextField label={t("profile.currentPassword")} value={emailPassword} onChangeText={setEmailPassword} secureTextEntry />
          {emailMessage && <Text style={[styles.message, { color: emailMessage.ok ? colors.success : colors.danger }]}>{emailMessage.text}</Text>}
          <Button
            title={t("profile.changeEmail")}
            onPress={() => void handleChangeEmail()}
            loading={emailSaving}
            disabled={!newEmail.trim() || !emailPassword}
            variant="secondary"
          />
        </View>
        <View style={styles.form}>
          <TextField label={t("profile.currentPassword")} value={pwCurrent} onChangeText={setPwCurrent} secureTextEntry />
          <TextField label={t("profile.newPassword")} value={pwNew} onChangeText={setPwNew} secureTextEntry />
          {pwMessage && <Text style={[styles.message, { color: pwMessage.ok ? colors.success : colors.danger }]}>{pwMessage.text}</Text>}
          <Button
            title={t("profile.changePassword")}
            onPress={() => void handleChangePassword()}
            loading={pwSaving}
            disabled={!pwCurrent || pwNew.length < 8}
            variant="secondary"
          />
        </View>

        {user && ["MODERATOR", "ADMIN", "SUPER_ADMIN"].includes(user.role) && (
          <Pressable style={styles.row} onPress={() => router.push("/admin")}>
            <Ionicons name="shield-checkmark" size={22} color={colors.accentFrom} />
            <View style={{ flex: 1 }}>
              <Text style={styles.rowText}>{t("nav.admin")}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.muted} />
          </Pressable>
        )}

        <Pressable style={styles.row} onPress={() => router.push({ pathname: "/", params: { tutorial: String(Date.now()) } })}>
          <Ionicons name="school-outline" size={22} color={colors.accentFrom} />
          <View style={{ flex: 1 }}>
            <Text style={styles.rowText}>{t("discover.showTips")}</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.muted} />
        </Pressable>

        <Pressable style={styles.row} onPress={() => router.push("/friends")}>
          <Ionicons name="people" size={22} color={colors.accentFrom} />
          <View style={{ flex: 1 }}>
            <Text style={styles.rowText}>{t("friends.title")}</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.muted} />
        </Pressable>

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
        <Pressable style={styles.row} onPress={confirmDeleteAccount}>
          <Ionicons name="trash-outline" size={22} color={colors.danger} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.rowText, { color: colors.danger }]}>{t("profile.deleteAccount")}</Text>
            <Text style={styles.rowHint}>{t("profile.deleteAccountHint")}</Text>
          </View>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md },
  card: { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg },
  avatar: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.accentFrom, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  avatarImage: { width: 64, height: 64 },
  avatarText: { color: colors.white, fontSize: 26, fontWeight: "800" },
  avatarBadge: {
    position: "absolute",
    right: -2,
    bottom: -2,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.accentTo,
    borderWidth: 2,
    borderColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
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
