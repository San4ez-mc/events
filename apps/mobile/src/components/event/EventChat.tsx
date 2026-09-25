import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { API_URL, getAccessToken } from "../../lib/api-client";
import { useTranslations } from "../../lib/locale-context";
import { colors, radius, spacing } from "../../lib/theme";

interface Message {
  id: string;
  text: string;
  createdAt: string;
  author: { id: string; name: string | null; avatarUrl: string | null };
  mine: boolean;
}

/**
 * UX §28 — group chat for confirmed participants and organizers. The API
 * answers 403 to everyone else, in which case nothing is rendered. New
 * messages arrive by light polling (no websockets in the MVP).
 */
export function EventChat({ eventId, refreshKey }: { eventId: string; refreshKey?: string }) {
  const { t, locale } = useTranslations();
  const [messages, setMessages] = useState<Message[]>([]);
  const [allowed, setAllowed] = useState(false);
  const [moderator, setModerator] = useState(false);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const lastCount = useRef(0);

  const load = useCallback(async () => {
    const token = getAccessToken();
    if (!token) return;
    const res = await fetch(`${API_URL}/api/v1/events/${eventId}/chat`, { headers: { Authorization: `Bearer ${token}` } });
    if (res.status === 401 || res.status === 403) {
      setAllowed(false);
      return;
    }
    if (!res.ok) return;
    const body = (await res.json()) as { items: Message[]; isModerator: boolean };
    setAllowed(true);
    setModerator(body.isModerator);
    setMessages(body.items);
  }, [eventId]);

  // refreshKey changes when the viewer's registration status does, so access appears/disappears immediately.
  useEffect(() => {
    void load();
    const poll = setInterval(() => void load(), 6000);
    return () => clearInterval(poll);
  }, [load, refreshKey]);

  useEffect(() => {
    if (messages.length > lastCount.current) setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
    lastCount.current = messages.length;
  }, [messages]);

  async function send() {
    const value = text.trim();
    const token = getAccessToken();
    if (!value || !token) return;
    setSending(true);
    try {
      const res = await fetch(`${API_URL}/api/v1/events/${eventId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ text: value }),
      });
      if (res.ok) {
        const created = (await res.json()) as Message;
        setMessages((m) => [...m, created]);
        setText("");
      }
    } finally {
      setSending(false);
    }
  }

  async function remove(id: string) {
    setMessages((m) => m.filter((x) => x.id !== id));
    const token = getAccessToken();
    if (!token) return;
    await fetch(`${API_URL}/api/v1/events/${eventId}/chat/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    }).catch(() => {});
  }

  if (!allowed) return null;

  const time = (iso: string) =>
    new Date(iso).toLocaleTimeString(locale === "uk" ? "uk-UA" : "en-US", { hour: "2-digit", minute: "2-digit" });

  return (
    <View style={styles.wrap}>
      <View style={styles.titleRow}>
        <Ionicons name="chatbubbles-outline" size={18} color={colors.foreground} />
        <Text style={styles.title}>{t("chat.title")}</Text>
      </View>
      <View style={styles.box}>
        <ScrollView ref={scrollRef} style={styles.list} contentContainerStyle={{ padding: spacing.md, gap: spacing.sm }} nestedScrollEnabled>
          {messages.length === 0 && <Text style={styles.empty}>{t("chat.empty")}</Text>}
          {messages.map((m) => (
            <View key={m.id} style={[styles.row, m.mine ? styles.rowMine : styles.rowOther]}>
              <Pressable
                onLongPress={m.mine || moderator ? () => void remove(m.id) : undefined}
                style={[styles.bubble, m.mine ? styles.bubbleMine : styles.bubbleOther]}
              >
                {!m.mine && <Text style={styles.author}>{m.author.name}</Text>}
                <Text style={styles.message}>{m.text}</Text>
                <Text style={styles.time}>{time(m.createdAt)}</Text>
              </Pressable>
            </View>
          ))}
        </ScrollView>
        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            value={text}
            onChangeText={setText}
            maxLength={1000}
            placeholder={t("chat.placeholder")}
            placeholderTextColor={colors.muted}
            onSubmitEditing={() => void send()}
            returnKeyType="send"
          />
          <Pressable
            onPress={() => void send()}
            disabled={sending || !text.trim()}
            style={[styles.send, (sending || !text.trim()) && { opacity: 0.4 }]}
            accessibilityLabel={t("chat.send")}
          >
            <Ionicons name="send" size={18} color={colors.white} />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: spacing.xl },
  titleRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.sm },
  title: { color: colors.foreground, fontSize: 15, fontWeight: "700" },
  box: { height: 320, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, overflow: "hidden" },
  list: { flex: 1 },
  empty: { color: colors.muted, textAlign: "center", paddingVertical: spacing.xl },
  row: { flexDirection: "row" },
  rowMine: { justifyContent: "flex-end" },
  rowOther: { justifyContent: "flex-start" },
  bubble: { maxWidth: "80%", borderRadius: radius.lg, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  bubbleMine: { backgroundColor: colors.accentFrom },
  bubbleOther: { backgroundColor: colors.surface },
  author: { color: colors.accentTo, fontSize: 12, fontWeight: "700", marginBottom: 2 },
  message: { color: colors.white, fontSize: 14 },
  time: { color: "rgba(255,255,255,0.6)", fontSize: 10, textAlign: "right", marginTop: 2 },
  inputRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, padding: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border },
  input: { flex: 1, height: 40, borderRadius: radius.full, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.lg, color: colors.foreground },
  send: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.accentFrom, alignItems: "center", justifyContent: "center" },
});
