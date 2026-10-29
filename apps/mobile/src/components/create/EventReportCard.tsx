import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { API_URL, getAccessToken, refreshAccessToken } from "../../lib/api-client";
import { useTranslations } from "../../lib/locale-context";
import { Button } from "../ui/Button";
import { radius, spacing, type Palette, useThemedStyles } from "../../lib/theme";

interface Participant {
  registrationId: string;
  name: string | null;
  nickname: string | null;
  avatarUrl: string | null;
  attended: boolean;
}
interface ReportState {
  eventEnded: boolean;
  report: { comment: string | null; submittedAt: string; attendedCount: number; registeredCount: number } | null;
  participants: Participant[];
}

async function call(path: string, init: RequestInit = {}, retried = false): Promise<Response> {
  const res = await fetch(`${API_URL}/api/v1${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${getAccessToken() ?? ""}`, ...(init.body ? { "Content-Type": "application/json" } : {}) },
  });
  if (res.status === 401 && !retried && (await refreshAccessToken())) return call(path, init, true);
  return res;
}

/**
 * After the event: who came (everybody starts ticked, the organizer unticks no-shows) and an optional note to the Kiro team
 * about what was missing. The "How did your event go?" notification opens the edit screen, which shows this card first.
 * Renders nothing before the event starts, without registrations, or when the viewer may not manage registrations.
 */
export function EventReportCard({ eventId }: { eventId: string }) {
  const { colors, styles } = useThemedStyles(makeStyles);
  const { t } = useTranslations();
  const [state, setState] = useState<ReportState | null>(null);
  const [came, setCame] = useState<Set<string>>(new Set());
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [failed, setFailed] = useState(false);
  const [hidden, setHidden] = useState(false);

  const apply = useCallback((next: ReportState) => {
    setState(next);
    setCame(new Set(next.participants.filter((p) => p.attended).map((p) => p.registrationId)));
    setComment(next.report?.comment ?? "");
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const res = await call(`/events/${eventId}/registrations/report`);
        if (!res.ok) return setHidden(true);
        apply((await res.json()) as ReportState);
      } catch {
        setHidden(true);
      }
    })();
  }, [eventId, apply]);

  async function submit() {
    setBusy(true);
    setFailed(false);
    setSaved(false);
    try {
      const res = await call(`/events/${eventId}/registrations/report`, { method: "PUT", body: JSON.stringify({ attendedIds: [...came], comment: comment.trim() || undefined }) });
      if (!res.ok) throw new Error(String(res.status));
      apply((await res.json()) as ReportState);
      setSaved(true);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  if (hidden) return null;
  if (!state) return <ActivityIndicator color={colors.accentFrom} />;
  if (!state.eventEnded || (state.participants.length === 0 && !state.report)) return null;

  const toggle = (id: string) =>
    setCame((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <View style={styles.card}>
      <Text style={styles.title}>{t("eventReport.title")}</Text>
      <Text style={styles.muted}>{t("eventReport.hint")}</Text>
      <Text style={styles.count}>
        {t("eventReport.count").replace("{came}", String(came.size)).replace("{total}", String(state.participants.length))}
      </Text>

      {state.participants.map((p) => {
        const on = came.has(p.registrationId);
        return (
          <Pressable key={p.registrationId} style={styles.row} onPress={() => toggle(p.registrationId)} accessibilityRole="checkbox" accessibilityState={{ checked: on }}>
            <Ionicons name={on ? "checkbox" : "square-outline"} size={24} color={on ? colors.accentFrom : colors.muted} />
            {p.avatarUrl ? <Image source={{ uri: p.avatarUrl }} style={styles.avatar} /> : <View style={[styles.avatar, styles.avatarEmpty]} />}
            <Text style={[styles.name, !on && styles.nameOff]} numberOfLines={1}>
              {p.name ?? p.nickname ?? t("eventReport.anonymous")}
            </Text>
          </Pressable>
        );
      })}

      <Text style={styles.label}>{t("eventReport.feedbackLabel")}</Text>
      <TextInput
        style={styles.input}
        value={comment}
        onChangeText={setComment}
        placeholder={t("eventReport.feedbackPlaceholder")}
        placeholderTextColor={colors.muted}
        multiline
        maxLength={3000}
      />
      {failed && <Text style={styles.error}>{t("common.somethingWentWrong")}</Text>}
      {saved && <Text style={styles.ok}>{t("eventReport.saved")}</Text>}
      <Button title={state.report ? t("eventReport.update") : t("eventReport.send")} onPress={() => void submit()} loading={busy} />
    </View>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, gap: spacing.sm },
    title: { color: colors.foreground, fontSize: 16, fontWeight: "800" },
    muted: { color: colors.muted, fontSize: 13 },
    count: { color: colors.foreground, fontSize: 13, fontWeight: "700" },
    row: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: 6 },
    avatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.background },
    avatarEmpty: { borderWidth: 1, borderColor: colors.border },
    name: { color: colors.foreground, fontSize: 14, flex: 1 },
    nameOff: { color: colors.muted, textDecorationLine: "line-through" },
    label: { color: colors.foreground, fontSize: 13, fontWeight: "700", marginTop: spacing.sm },
    input: { minHeight: 90, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.sm, color: colors.foreground, textAlignVertical: "top" },
    error: { color: colors.danger, fontSize: 13 },
    ok: { color: colors.success, fontSize: 13 },
  });
