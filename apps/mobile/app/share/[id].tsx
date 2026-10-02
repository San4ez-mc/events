import { useCallback, useEffect, useState } from "react";
import { captureEvent } from "../../src/lib/product-analytics";
import { router, useLocalSearchParams } from "expo-router";
import { ActivityIndicator, Alert, Image, ScrollView, StyleSheet, Text, View } from "react-native";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { SYSTEM_SETTING_DEFAULTS, SystemSettingKey } from "@kiro/types";
import { API_URL, getAccessToken } from "../../src/lib/api-client";
import { useAuth } from "../../src/lib/auth-context";
import { useTranslations } from "../../src/lib/locale-context";
import { Button } from "../../src/components/ui/Button";
import { TextField } from "../../src/components/ui/TextField";
import { ScreenHeader } from "../../src/components/ui/ScreenHeader";
import { formatShortDate } from "../../src/lib/format";
import { radius, spacing, type Palette, useThemedStyles } from "../../src/lib/theme";

interface ReferralSubmission {
  id: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  note: string | null;
  createdAt: string;
  event: { id: string; title: string; slug: string } | null;
}

const BONUS_CREDITS = SYSTEM_SETTING_DEFAULTS[SystemSettingKey.REFERRAL_BONUS_CREDITS] as number;

const STATUS_STYLE_KEY: Record<ReferralSubmission["status"], "pending" | "approved" | "rejected"> = {
  PENDING: "pending",
  APPROVED: "approved",
  REJECTED: "rejected",
};

/**
 * Marketing §referral — "share this event, tag @kiro.ukraine, earn credits". The share image
 * itself is server-generated (GET /events/:id/share-image, public), so there's nothing to design
 * here: just show it, hand it to the OS share sheet, then let the user submit the post link for
 * manual review (same submit-and-wait posture as a Report).
 */
export default function ShareForCreditsScreen() {
  const { colors, styles } = useThemedStyles(makeStyles);
  const { id } = useLocalSearchParams<{ id: string }>();
  const { isLoading: authLoading } = useAuth();
  const { t } = useTranslations();

  const [sharing, setSharing] = useState(false);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submissions, setSubmissions] = useState<ReferralSubmission[] | null>(null);

  const loadMine = useCallback(async () => {
    const token = getAccessToken();
    if (!token) return;
    const res = await fetch(`${API_URL}/api/v1/referrals/mine`, { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) setSubmissions((await res.json()) as ReferralSubmission[]);
  }, []);

  useEffect(() => {
    if (authLoading || !id) return;
    if (!getAccessToken()) {
      router.replace("/login");
      return;
    }
    void loadMine();
  }, [authLoading, id, loadMine]);

  async function shareImage() {
    setSharing(true);
    try {
      const file = await File.downloadFileAsync(`${API_URL}/api/v1/events/${id}/share-image`, Paths.cache, { idempotent: true });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(file.uri, { mimeType: "image/jpeg", dialogTitle: t("referral.shareTitle") });
      } else {
        Alert.alert(t("common.somethingWentWrong"));
      }
    } catch {
      Alert.alert(t("common.somethingWentWrong"));
    } finally {
      setSharing(false);
    }
  }

  async function submit() {
    const token = getAccessToken();
    if (!token) return;
    setSubmitting(true);
    try {
      const res = await fetch(`${API_URL}/api/v1/referrals`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ eventId: id, note: note.trim() || undefined }),
      });
      if (res.ok) {
        setNote("");
        captureEvent("referral_submitted", { from: "share_screen", event_id: id });
        await loadMine();
        Alert.alert(t("referral.submitted"));
      } else {
        Alert.alert(t("common.somethingWentWrong"));
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.content}>
      <ScreenHeader title={t("referral.title")} icon="megaphone" />

      <Image source={{ uri: `${API_URL}/api/v1/events/${id}/share-image` }} style={styles.preview} resizeMode="cover" />

      <View style={styles.card}>
        <Text style={styles.body}>{t("referral.instructions").replace("{count}", String(BONUS_CREDITS))}</Text>
        <Button title={t("referral.shareButton")} loading={sharing} onPress={() => void shareImage()} />
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>{t("referral.notePlaceholder")}</Text>
        <TextField label={t("referral.noteLabel")} value={note} onChangeText={setNote} placeholder={t("referral.notePlaceholder")} autoCapitalize="none" />
        <Button title={t("referral.submit")} loading={submitting} onPress={() => void submit()} />
      </View>

      {submissions !== null && submissions.length > 0 && (
        <>
          <Text style={styles.section}>{t("referral.myClaims")}</Text>
          {submissions.map((s) => (
            <View key={s.id} style={styles.claimRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.claimEvent} numberOfLines={1}>
                  {s.event?.title ?? t("referral.generalClaim")}
                </Text>
                <Text style={styles.muted}>{formatShortDate(s.createdAt)}</Text>
              </View>
              <Text style={[styles.statusBadge, styles[`status_${STATUS_STYLE_KEY[s.status]}`]]}>
                {t(`referral.status.${s.status}`)}
              </Text>
            </View>
          ))}
        </>
      )}
      {submissions === null && <ActivityIndicator color={colors.accentFrom} />}
    </ScrollView>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md },
  preview: { width: "100%", aspectRatio: 1080 / 1920, borderRadius: radius.lg, backgroundColor: colors.surface },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.md },
  label: { color: colors.foreground, fontSize: 13, fontWeight: "600" },
  body: { color: colors.foreground, fontSize: 14, lineHeight: 20 },
  section: { color: colors.muted, fontSize: 12, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.8, marginTop: spacing.md },
  claimRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md },
  claimEvent: { color: colors.foreground, fontSize: 14, fontWeight: "600" },
  muted: { color: colors.muted, fontSize: 12 },
  statusBadge: { fontSize: 11, fontWeight: "800", paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: radius.full, overflow: "hidden" },
  status_pending: { backgroundColor: "rgba(234,179,8,0.2)", color: "#b45309" },
  status_approved: { backgroundColor: "rgba(16,185,129,0.2)", color: "#047857" },
  status_rejected: { backgroundColor: "rgba(239,68,68,0.2)", color: "#b91c1c" },
});
