import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { API_URL, getAccessToken } from "../../lib/api-client";
import { useAuth } from "../../lib/auth-context";
import { useTranslations } from "../../lib/locale-context";
import { radius, spacing, type Palette, useThemedStyles } from "../../lib/theme";
import { Button } from "../ui/Button";

/** Shown to signed-in users who never confirmed their email: it guards password recovery and receipts. */
export function VerifyEmailBanner() {
  const { styles } = useThemedStyles(makeStyles);
  const { user } = useAuth();
  const { t } = useTranslations();
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  if (!user || user.emailVerifiedAt) return null;

  async function resend() {
    setState("sending");
    const res = await fetch(`${API_URL}/api/v1/auth/resend-verification`, { method: "POST", headers: { Authorization: `Bearer ${getAccessToken() ?? ""}` } }).catch(() => null);
    setState(res?.ok ? "sent" : "idle");
  }

  return (
    <View style={styles.card}>
      <Text style={styles.title}>{t("verify.title")}</Text>
      <Text style={styles.text}>{t("verify.text")}</Text>
      {state === "sent" ? <Text style={styles.sent}>{t("verify.sent")}</Text> : <Button title={t("verify.resend")} variant="secondary" loading={state === "sending"} onPress={() => void resend()} />}
    </View>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    card: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.accentFrom, padding: spacing.lg, gap: spacing.sm },
    title: { color: colors.foreground, fontSize: 15, fontWeight: "700" },
    text: { color: colors.muted, fontSize: 13, lineHeight: 18 },
    sent: { color: colors.success, fontSize: 14, fontWeight: "700" },
  });
