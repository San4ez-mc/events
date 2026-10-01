import { Image, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { API_URL, getAccessToken } from "../../lib/api-client";
import { useTranslations } from "../../lib/locale-context";
import { radius, spacing, type Palette, useThemedStyles } from "../../lib/theme";

/**
 * QR for an organizer to print/display at the venue — encodes the event's public page link
 * (GET /events/:id/qr, rendered server-side so no QR/SVG native dependency is needed here).
 * Owner-only endpoint, so the request needs the bearer token — unlike ProfileQrModal's public
 * one, Image can't fetch this without an explicit Authorization header.
 */
export function EventQrModal({ eventId, title, visible, onClose }: { eventId: string; title: string; visible: boolean; onClose: () => void }) {
  const { colors, styles } = useThemedStyles(makeStyles);
  const { t } = useTranslations();
  const token = getAccessToken();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.header}>
            <Text style={styles.title}>{t("events.actions.qr")}</Text>
            <Pressable onPress={onClose} hitSlop={10} accessibilityLabel={t("common.cancel")}>
              <Ionicons name="close" size={22} color={colors.foreground} />
            </Pressable>
          </View>
          {/* White card behind the code: QR scanners need dark-on-light regardless of the app's dark theme. */}
          <View style={styles.qrWrap}>
            {token && (
              <Image
                source={{ uri: `${API_URL}/api/v1/events/${eventId}/qr`, headers: { Authorization: `Bearer ${token}` } }}
                style={styles.qr}
                resizeMode="contain"
              />
            )}
          </View>
          <Text style={styles.name} numberOfLines={2}>
            {title}
          </Text>
          <Text style={styles.hint}>{t("events.actions.qrHint")}</Text>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", alignItems: "center", justifyContent: "center", padding: spacing.xl },
  sheet: { width: "100%", maxWidth: 360, backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.md, alignItems: "center" },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", alignSelf: "stretch" },
  title: { color: colors.foreground, fontSize: 16, fontWeight: "700" },
  qrWrap: { backgroundColor: colors.white, borderRadius: radius.md, padding: spacing.sm, width: 240, height: 240, alignItems: "center", justifyContent: "center" },
  qr: { width: 224, height: 224 },
  name: { color: colors.foreground, fontSize: 15, fontWeight: "700", textAlign: "center" },
  hint: { color: colors.muted, fontSize: 12, textAlign: "center" },
});
