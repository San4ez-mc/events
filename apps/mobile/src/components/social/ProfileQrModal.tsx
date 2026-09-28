import { Image, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { API_URL } from "../../lib/api-client";
import { useTranslations } from "../../lib/locale-context";
import { colors, radius, spacing } from "../../lib/theme";

/**
 * §24 (UX) — "add me as a friend" QR. The image is rendered by the API (GET /users/:id/qr) and encodes the
 * public profile link, so scanning it with any camera opens the profile in the app (or on the website).
 * Rendered server-side so the app needs no QR/SVG native dependency.
 */
export function ProfileQrModal({ userId, name, visible, onClose }: { userId: string; name: string; visible: boolean; onClose: () => void }) {
  const { t } = useTranslations();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.header}>
            <Text style={styles.title}>{t("profile.myQr")}</Text>
            <Pressable onPress={onClose} hitSlop={10} accessibilityLabel={t("common.cancel")}>
              <Ionicons name="close" size={22} color={colors.foreground} />
            </Pressable>
          </View>
          {/* White card behind the code: QR scanners need dark-on-light regardless of the app's dark theme. */}
          <View style={styles.qrWrap}>
            <Image source={{ uri: `${API_URL}/api/v1/users/${userId}/qr` }} style={styles.qr} resizeMode="contain" />
          </View>
          <Text style={styles.name}>{name}</Text>
          <Text style={styles.hint}>{t("profile.myQrHint")}</Text>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", alignItems: "center", justifyContent: "center", padding: spacing.xl },
  sheet: { width: "100%", maxWidth: 360, backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.md, alignItems: "center" },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", alignSelf: "stretch" },
  title: { color: colors.foreground, fontSize: 16, fontWeight: "700" },
  qrWrap: { backgroundColor: colors.white, borderRadius: radius.md, padding: spacing.sm },
  qr: { width: 240, height: 240 },
  name: { color: colors.foreground, fontSize: 15, fontWeight: "700" },
  hint: { color: colors.muted, fontSize: 12, textAlign: "center" },
});
