import { useCallback, useEffect, useRef, useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { Alert, FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { API_URL, getAccessToken } from "../../src/lib/api-client";
import { useAuth } from "../../src/lib/auth-context";
import { useTranslations } from "../../src/lib/locale-context";
import { formatShortDateTime } from "../../src/lib/format";
import { personName, type InquiryThread } from "../../src/lib/inbox-types";
import { AdminLoader } from "../../src/components/admin/AdminLoader";
import { radius, spacing, type Palette, useThemedStyles } from "../../src/lib/theme";

/** One conversation with an organizer (or with a person who asked about your event). Polls for new messages. */
export default function InquiryScreen() {
  const { colors, styles } = useThemedStyles(makeStyles);
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user, isLoading } = useAuth();
  const { t } = useTranslations();
  const [thread, setThread] = useState<InquiryThread | null>(null);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const listRef = useRef<FlatList>(null);

  const load = useCallback(async () => {
    const token = getAccessToken();
    if (!token || !id) return;
    const res = await fetch(`${API_URL}/api/v1/inquiries/${id}`, { headers: { Authorization: `Bearer ${token}` } }).catch(() => null);
    if (res?.ok) setThread((await res.json()) as InquiryThread);
  }, [id]);

  useEffect(() => {
    if (isLoading) return;
    if (!user) {
      router.replace("/login");
      return;
    }
    void load();
    const timer = setInterval(() => void load(), 12000);
    return () => clearInterval(timer);
  }, [isLoading, user, load]);

  async function send() {
    const value = text.trim();
    const token = getAccessToken();
    if (!value || !token || sending) return;
    setSending(true);
    try {
      const res = await fetch(`${API_URL}/api/v1/inquiries/${id}/messages`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ text: value }),
      });
      if (res.ok) {
        setText("");
        await load();
        setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
      } else {
        const code = ((await res.json().catch(() => null)) as { error?: { code?: string } } | null)?.error?.code;
        Alert.alert(code === "USER_BLOCKED" ? t("inbox.blocked") : t("inbox.failed"));
      }
    } finally {
      setSending(false);
    }
  }

  if (!thread) return <View style={styles.container}><AdminLoader /></View>;

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={90}>
      <Pressable style={styles.header} onPress={() => router.push(`/event/${thread.event.slug}`)}>
        <View style={{ flex: 1 }}>
          <Text style={styles.name} numberOfLines={1}>{personName(thread.counterpart)}</Text>
          <Text style={styles.eventLink} numberOfLines={1}>{thread.event.title}</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.muted} />
      </Pressable>
      <FlatList
        ref={listRef}
        data={thread.messages}
        keyExtractor={(m) => m.id}
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm }}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
        renderItem={({ item }) => (
          <View style={[styles.bubble, item.mine ? styles.mine : styles.theirs]}>
            <Text style={[styles.bubbleText, item.mine && { color: colors.white }]}>{item.text}</Text>
            <Text style={[styles.time, item.mine && { color: "rgba(255,255,255,0.7)" }]}>{formatShortDateTime(item.createdAt)}</Text>
          </View>
        )}
      />
      <View style={styles.composer}>
        <TextInput value={text} onChangeText={setText} placeholder={t("inbox.placeholder")} placeholderTextColor={colors.muted} multiline maxLength={1000} style={styles.input} />
        <Pressable onPress={() => void send()} disabled={sending || !text.trim()} style={[styles.send, (sending || !text.trim()) && { opacity: 0.5 }]} accessibilityLabel={t("inbox.send")}>
          <Ionicons name="send" size={20} color={colors.white} />
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: { flexDirection: "row", alignItems: "center", gap: spacing.sm, padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.border },
    name: { color: colors.foreground, fontSize: 18, fontWeight: "800" },
    eventLink: { color: colors.accentFrom, fontSize: 13 },
    bubble: { maxWidth: "85%", borderRadius: radius.lg, paddingHorizontal: 14, paddingVertical: 8, gap: 2 },
    mine: { alignSelf: "flex-end", backgroundColor: colors.accentFrom },
    theirs: { alignSelf: "flex-start", backgroundColor: colors.surface },
    bubbleText: { color: colors.foreground, fontSize: 15, lineHeight: 21 },
    time: { color: colors.muted, fontSize: 11 },
    composer: { flexDirection: "row", alignItems: "flex-end", gap: spacing.sm, padding: spacing.md, borderTopWidth: 1, borderTopColor: colors.border },
    input: { flex: 1, maxHeight: 120, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface, color: colors.foreground, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 },
    send: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.accentFrom, alignItems: "center", justifyContent: "center" },
  });
