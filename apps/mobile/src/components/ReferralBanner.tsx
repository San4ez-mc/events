import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { API_URL, getAccessToken } from "../lib/api-client";
import { useTranslations } from "../lib/locale-context";
import { Button } from "./ui/Button";
import { TextField } from "./ui/TextField";
import { radius, spacing, type Palette, useThemedStyles } from "../lib/theme";

/**
 * Marketing §referral — "share and earn credits" banner, shown on both the credits and
 * subscription screens (the two places someone thinking about credits already is). Submits a
 * general (no-event) claim — sharing a specific event instead goes through /share/:id, reachable
 * from that event's own "⋯" menu, which also shows the server-generated share image.
 */
export function ReferralBanner() {
  const { styles } = useThemedStyles(makeStyles);
  const { t } = useTranslations();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  async function submit() {
    const token = getAccessToken();
    if (!token || !note.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch(`${API_URL}/api/v1/referrals`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ note: note.trim() }),
      });
      if (res.ok) {
        setNote("");
        setOpen(false);
        setSubmitted(true);
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <Pressable style={styles.banner} onPress={() => setOpen((v) => !v)}>
        <Text style={styles.title}>{t("credits.referralBannerTitle")}</Text>
        <Text style={styles.body}>{t("credits.referralBannerBody")}</Text>
        {!open && <Text style={styles.cta}>{submitted ? t("referral.submitted") : t("credits.referralBannerCta")}</Text>}
      </Pressable>
      {open && (
        <View style={styles.card}>
          <TextField label={t("referral.noteLabel")} value={note} onChangeText={setNote} placeholder={t("referral.notePlaceholder")} autoCapitalize="none" />
          <Button title={t("referral.submit")} loading={submitting} disabled={!note.trim()} onPress={() => void submit()} />
        </View>
      )}
    </>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  banner: { backgroundColor: colors.accentFrom, borderRadius: radius.lg, padding: spacing.lg, gap: 4 },
  title: { color: colors.white, fontSize: 15, fontWeight: "800" },
  body: { color: "rgba(255,255,255,0.9)", fontSize: 13, lineHeight: 18 },
  cta: { color: colors.white, fontSize: 13, fontWeight: "700", marginTop: spacing.sm, textDecorationLine: "underline" },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.md },
});
