import { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { API_URL, getAccessToken } from "../../lib/api-client";
import { useAuth } from "../../lib/auth-context";
import { useTranslations } from "../../lib/locale-context";
import { Button } from "../ui/Button";
import { colors, radius, spacing } from "../../lib/theme";

interface Review {
  id: string;
  rating: number;
  text: string | null;
  authorUserId: string;
  author: { name: string | null; nickname: string | null };
}

/** §37/§38 — rating summary, published reviews and (after the event) the leave-a-review form. */
export function ReviewsSection({ eventId, eventStatus, summary }: { eventId: string; eventStatus: string; summary?: { average: number | null; count: number } }) {
  const { user } = useAuth();
  const { t } = useTranslations();
  const [reviews, setReviews] = useState<Review[] | null>(null);
  const [rating, setRating] = useState(0);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`${API_URL}/api/v1/events/${eventId}/reviews`);
    if (res.ok) setReviews((await res.json()).items);
  }, [eventId]);

  useEffect(() => {
    void load();
  }, [load]);

  const mine = user ? reviews?.find((r) => r.authorUserId === user.id) : undefined;
  const canReview = eventStatus === "COMPLETED" && !!user && !mine;

  async function submit() {
    const token = getAccessToken();
    if (!token || rating < 1) return;
    setBusy(true);
    setFailed(false);
    try {
      const res = await fetch(`${API_URL}/api/v1/events/${eventId}/reviews`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ rating, text: text.trim() || undefined }),
      });
      if (!res.ok) return setFailed(true);
      setRating(0);
      setText("");
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    const token = getAccessToken();
    if (!token) return;
    setBusy(true);
    try {
      await fetch(`${API_URL}/api/v1/reviews/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
      await load();
    } finally {
      setBusy(false);
    }
  }

  // Nothing to show before the event unless somebody already reviewed it.
  if (eventStatus !== "COMPLETED" && (reviews?.length ?? 0) === 0) return null;

  const stars = (value: number, onPick?: (n: number) => void) => (
    <View style={styles.stars}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Pressable key={n} disabled={!onPick} onPress={() => onPick?.(n)} hitSlop={6}>
          <Ionicons name={n <= value ? "star" : "star-outline"} size={onPick ? 30 : 14} color="#f59e0b" />
        </Pressable>
      ))}
    </View>
  );

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>{t("reviews.title")}</Text>
      <Text style={styles.muted}>{summary?.average != null ? `⭐ ${summary.average.toFixed(1)} (${summary.count})` : t("reviews.noRating")}</Text>

      {canReview && (
        <View style={styles.form}>
          <Text style={styles.label}>{t("reviews.leaveReview")}</Text>
          {stars(rating, setRating)}
          <TextInput value={text} onChangeText={setText} placeholder={t("reviews.textLabel")} placeholderTextColor={colors.muted} style={styles.input} multiline />
          {failed && <Text style={styles.error}>{t("reviews.submitError")}</Text>}
          <Button title={t("reviews.submit")} onPress={() => void submit()} loading={busy} disabled={rating < 1} />
        </View>
      )}

      {reviews?.map((r) => (
        <View key={r.id} style={styles.card}>
          <View style={styles.cardHead}>
            <Text style={styles.author}>{r.author.name ?? r.author.nickname ?? "—"}</Text>
            {stars(r.rating)}
          </View>
          {r.text ? <Text style={styles.text}>{r.text}</Text> : null}
          {r.id === mine?.id && (
            <Pressable onPress={() => void remove(r.id)} disabled={busy}>
              <Text style={styles.remove}>{t("reviews.delete")}</Text>
            </Pressable>
          )}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm, marginBottom: spacing.xl },
  title: { color: colors.foreground, fontSize: 15, fontWeight: "700" },
  muted: { color: colors.muted, fontSize: 13 },
  label: { color: colors.foreground, fontSize: 14, fontWeight: "600" },
  form: { gap: spacing.sm, backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md },
  stars: { flexDirection: "row", gap: 4 },
  input: { minHeight: 70, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.sm, color: colors.foreground, textAlignVertical: "top" },
  error: { color: colors.danger, fontSize: 12 },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, gap: 4 },
  cardHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  author: { color: colors.foreground, fontWeight: "600", fontSize: 14 },
  text: { color: colors.foreground, fontSize: 13, lineHeight: 18 },
  remove: { color: colors.danger, fontSize: 12, marginTop: 4 },
});
