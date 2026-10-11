import { useEffect, useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { Alert, Linking, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { API_URL, getAccessToken } from "../../../src/lib/api-client";
import { useAuth } from "../../../src/lib/auth-context";
import { useTranslations } from "../../../src/lib/locale-context";
import type { InquiryByEvent } from "../../../src/lib/inbox-types";
import { Button } from "../../../src/components/ui/Button";
import { AdminLoader } from "../../../src/components/admin/AdminLoader";
import { radius, spacing, type Palette, useThemedStyles } from "../../../src/lib/theme";

/** First question about an event (or straight to the existing conversation). External events send people to the organizer's site. */
export default function InquiryEventScreen() {
  const { colors, styles } = useThemedStyles(makeStyles);
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const { user, isLoading } = useAuth();
  const { t } = useTranslations();
  const [info, setInfo] = useState<InquiryByEvent | null>(null);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (isLoading) return;
    if (!user) {
      router.replace("/login");
      return;
    }
    (async () => {
      const token = getAccessToken();
      const res = await fetch(`${API_URL}/api/v1/inquiries/by-event/${eventId}`, { headers: { Authorization: `Bearer ${token ?? ""}` } }).catch(() => null);
      if (!res?.ok) return;
      const body = (await res.json()) as InquiryByEvent;
      if (body.id) router.replace(`/inbox/${body.id}`);
      else setInfo(body);
    })();
  }, [isLoading, user, eventId]);

  async function send() {
    const value = text.trim();
    if (!value || sending) return;
    setSending(true);
    try {
      const res = await fetch(`${API_URL}/api/v1/events/${eventId}/inquiries`, {
        method: "POST",
        headers: { Authorization: `Bearer ${getAccessToken() ?? ""}`, "Content-Type": "application/json" },
        body: JSON.stringify({ text: value }),
      });
      if (res.ok) {
        const body = (await res.json()) as { id: string };
        router.replace(`/inbox/${body.id}`);
      } else {
        const code = ((await res.json().catch(() => null)) as { error?: { code?: string } } | null)?.error?.code;
        Alert.alert(code === "USER_BLOCKED" ? t("inbox.blocked") : t("inbox.failed"));
      }
    } finally {
      setSending(false);
    }
  }

  if (!info) return <View style={styles.container}><AdminLoader /></View>;

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }} keyboardShouldPersistTaps="handled">
      <Text style={styles.title}>{t("inbox.writeTitle")}</Text>
      <View style={styles.eventCard}>
        <Text style={styles.muted}>{t("inbox.aboutEvent")}</Text>
        <Text style={styles.eventTitle}>{info.event.title}</Text>
      </View>
      {info.isOwner ? (
        <Text style={styles.muted}>{t("inbox.yourEvent")}</Text>
      ) : info.event.registrationMode === "EXTERNAL" && info.event.externalRegistrationUrl ? (
        <>
          <Text style={styles.muted}>{t("inbox.externalHint")}</Text>
          <Button title={t("inbox.askOnSite")} onPress={() => void Linking.openURL(info.event.externalRegistrationUrl!)} />
        </>
      ) : (
        <>
          <Text style={styles.muted}>{t("inbox.startHint")}</Text>
          <TextInput value={text} onChangeText={setText} placeholder={t("inbox.placeholder")} placeholderTextColor={colors.muted} multiline maxLength={1000} style={styles.input} />
          <Button title={sending ? t("inbox.sending") : t("inbox.send")} onPress={() => void send()} loading={sending} disabled={!text.trim()} />
        </>
      )}
    </ScrollView>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    title: { color: colors.foreground, fontSize: 26, fontWeight: "800" },
    muted: { color: colors.muted, fontSize: 14, lineHeight: 20 },
    eventCard: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius.lg, padding: spacing.md, gap: 2 },
    eventTitle: { color: colors.foreground, fontSize: 16, fontWeight: "700" },
    input: { minHeight: 110, textAlignVertical: "top", borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface, color: colors.foreground, padding: spacing.md, fontSize: 15 },
  });
