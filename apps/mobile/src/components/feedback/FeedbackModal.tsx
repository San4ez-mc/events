import { useEffect, useState } from "react";
import { Image, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as ImagePicker from "expo-image-picker";
import { File } from "expo-file-system";
import { API_URL, getAccessToken, refreshAccessToken } from "../../lib/api-client";
import { useTranslations } from "../../lib/locale-context";
import { radius, spacing, type Palette, useThemedStyles } from "../../lib/theme";
import { Button } from "../ui/Button";

/** "Повідомити про проблему розробнику": free text + optional screenshot, lands in the admin panel (POST /feedback/report). */
export function FeedbackModal({ visible, onClose, context }: { visible: boolean; onClose: () => void; context?: string }) {
  const { colors, styles } = useThemedStyles(makeStyles);
  const { t } = useTranslations();
  const [text, setText] = useState("");
  const [shot, setShot] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  // A fresh form every time it opens.
  useEffect(() => {
    if (!visible) return;
    setText("");
    setShot(null);
    setBusy(false);
    setError(null);
    setDone(false);
  }, [visible]);

  async function pickShot() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.8 });
    const asset = result.canceled ? null : result.assets[0];
    if (asset) setShot(asset.uri);
  }

  async function send() {
    if (text.trim().length < 3) return setError(t("feedback.tooShort"));
    setBusy(true);
    setError(null);
    try {
      const build = (retried: boolean): Promise<Response> => {
        const data = new FormData();
        data.append("text", text.trim());
        if (context) data.append("context", context);
        data.append("platform", Platform.OS === "ios" ? "ios" : "android");
        const version = Constants.expoConfig?.version;
        if (version) data.append("appVersion", version);
        const buildNumber = Number(Constants.nativeBuildVersion);
        if (Number.isInteger(buildNumber)) data.append("buildNumber", String(buildNumber));
        const device = [Device.manufacturer, Device.modelName, Device.osVersion ? `${Device.osName ?? ""} ${Device.osVersion}` : null].filter(Boolean).join(" · ");
        if (device) data.append("device", device.slice(0, 120));
        // Expo SDK 57's fetch only takes Blob-like FormData parts; expo-file-system's File implements Blob (same as the avatar upload).
        if (shot) data.append("file", new File(shot), "screenshot.jpg");
        const token = getAccessToken();
        return fetch(`${API_URL}/api/v1/feedback/report`, { method: "POST", headers: token ? { Authorization: `Bearer ${token}` } : {}, body: data }).then(async (res) => {
          if (res.status === 401 && !retried && (await refreshAccessToken())) return build(true);
          return res;
        });
      };
      const res = await build(false);
      if (!res.ok) throw new Error(String(res.status));
      setDone(true);
    } catch {
      setError(t("feedback.error"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <Pressable style={styles.backdrop} onPress={onClose}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.header}>
              <Text style={styles.title}>{t("feedback.title")}</Text>
              <Pressable onPress={onClose} hitSlop={10} accessibilityLabel={t("common.cancel")}>
                <Ionicons name="close" size={22} color={colors.foreground} />
              </Pressable>
            </View>
            {done ? (
              <View style={styles.body}>
                <Text style={styles.text}>{t("feedback.sent")}</Text>
                <Button title={t("common.done")} onPress={onClose} />
              </View>
            ) : (
              <ScrollView style={{ maxHeight: 520 }} contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
                <Text style={styles.muted}>{t("feedback.hint")}</Text>
                <TextInput
                  value={text}
                  onChangeText={setText}
                  placeholder={t("feedback.placeholder")}
                  placeholderTextColor={colors.muted}
                  multiline
                  maxLength={4000}
                  style={styles.input}
                />
                {shot ? (
                  <View style={styles.shotWrap}>
                    <Image source={{ uri: shot }} style={styles.shot} resizeMode="cover" />
                    <Pressable onPress={() => setShot(null)} style={styles.shotRemove} accessibilityLabel={t("feedback.remove")} hitSlop={8}>
                      <Ionicons name="close" size={16} color="#fff" />
                    </Pressable>
                  </View>
                ) : (
                  <Button title={t("feedback.attach")} variant="secondary" onPress={() => void pickShot()} />
                )}
                {error ? <Text style={styles.error}>{error}</Text> : null}
                <Button title={t("feedback.send")} onPress={() => void send()} loading={busy} disabled={text.trim().length < 3} />
              </ScrollView>
            )}
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
    sheet: { backgroundColor: colors.background, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, paddingBottom: spacing.xl, paddingTop: spacing.md },
    header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: spacing.lg, paddingBottom: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
    title: { color: colors.foreground, fontSize: 17, fontWeight: "700", flex: 1, paddingRight: spacing.md },
    body: { padding: spacing.lg, gap: spacing.md },
    text: { color: colors.foreground, fontSize: 15, lineHeight: 21 },
    muted: { color: colors.muted, fontSize: 13, lineHeight: 18 },
    error: { color: colors.danger, fontSize: 13 },
    input: { minHeight: 110, textAlignVertical: "top", color: colors.foreground, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, fontSize: 14 },
    shotWrap: { alignSelf: "flex-start" },
    shot: { width: 140, height: 140, borderRadius: radius.md },
    shotRemove: { position: "absolute", top: 6, right: 6, width: 24, height: 24, borderRadius: 12, backgroundColor: "rgba(0,0,0,0.65)", alignItems: "center", justifyContent: "center" },
  });
