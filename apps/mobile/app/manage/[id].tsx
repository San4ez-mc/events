import { useCallback, useEffect, useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { API_URL, getAccessToken } from "../../src/lib/api-client";
import { useAuth } from "../../src/lib/auth-context";
import { useTranslations } from "../../src/lib/locale-context";
import { Button } from "../../src/components/ui/Button";
import { radius, spacing, type Palette, useThemedStyles } from "../../src/lib/theme";

interface Reg {
  id: string;
  status: string;
  checkedInAt: string | null;
  user: { id: string; name: string | null; nickname: string | null; email: string; phone: string | null };
  answers: { id: string; field: { label: string }; valueJson: unknown }[];
}
interface Stats {
  registrations: number;
  confirmed: number;
  cancellations: number;
  saves: number;
  impressions?: number;
  views?: number;
  shares?: number;
  conversionViewToRegistration?: number | null;
}

const STATUS_KEYS: Record<string, string> = {
  PENDING: "registration.pending",
  REGISTERED: "registration.registered",
  PAYMENT_PENDING: "registration.paymentPendingConfirmation",
  CONFIRMED: "registration.confirmed",
  REJECTED: "registration.rejected",
  CANCELLED: "registration.cancelRegistration",
  WAITLISTED: "registration.waitlisted",
  ATTENDED: "organizerRegistrations.checkedIn",
  NO_SHOW: "registration.noShow",
};

const answerText = (v: unknown) => (Array.isArray(v) ? v.join(", ") : typeof v === "boolean" ? (v ? "✓" : "—") : String(v ?? "—"));

/** Organizer tools on mobile: funnel numbers + approve / reject / confirm payment (§26, §35). */
export default function ManageEventScreen() {
  const { colors, styles } = useThemedStyles(makeStyles);
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user, isLoading } = useAuth();
  const { t } = useTranslations();
  const [regs, setRegs] = useState<Reg[] | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [messageOpen, setMessageOpen] = useState(false);
  const [messageText, setMessageText] = useState("");
  const [sendingMessage, setSendingMessage] = useState(false);

  const load = useCallback(async () => {
    const token = getAccessToken();
    if (!token) return;
    const headers = { Authorization: `Bearer ${token}` };
    const [r, s] = await Promise.all([
      fetch(`${API_URL}/api/v1/events/${id}/registrations?limit=50`, { headers }),
      fetch(`${API_URL}/api/v1/events/${id}/stats`, { headers }),
    ]);
    setRegs(r.ok ? (await r.json()).items : []);
    if (s.ok) setStats(await s.json());
  }, [id]);

  useEffect(() => {
    if (isLoading) return;
    if (!user) {
      router.replace("/login");
      return;
    }
    void load();
  }, [isLoading, user, load]);

  async function act(regId: string, action: "approve" | "reject" | "confirm-payment" | "check-in") {
    const token = getAccessToken();
    if (!token) return;
    setBusy(regId);
    try {
      await fetch(`${API_URL}/api/v1/events/${id}/registrations/${regId}/${action}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}` },
      });
      await load();
    } finally {
      setBusy(null);
    }
  }

  async function exportCsv() {
    const token = getAccessToken();
    if (!token) return;
    setExporting(true);
    try {
      const file = await File.downloadFileAsync(`${API_URL}/api/v1/events/${id}/registrations/export.csv`, Paths.cache, {
        idempotent: true,
        headers: { Authorization: `Bearer ${token}` },
      });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(file.uri, { mimeType: "text/csv", dialogTitle: t("organizerRegistrations.exportCsv") });
      } else {
        Alert.alert(t("common.somethingWentWrong"));
      }
    } catch {
      Alert.alert(t("common.somethingWentWrong"));
    } finally {
      setExporting(false);
    }
  }

  async function sendMessage() {
    const token = getAccessToken();
    if (!token || !messageText.trim()) return;
    setSendingMessage(true);
    try {
      const res = await fetch(`${API_URL}/api/v1/events/${id}/registrations/message`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ message: messageText.trim() }),
      });
      if (res.ok) {
        setMessageText("");
        setMessageOpen(false);
        Alert.alert(t("organizerRegistrations.messageSent"));
      } else {
        Alert.alert(t("common.somethingWentWrong"));
      }
    } finally {
      setSendingMessage(false);
    }
  }

  if (regs === null) return <ActivityIndicator style={{ flex: 1 }} color={colors.accentFrom} />;

  const numbers: [string, number | string | undefined][] = [
    [t("organizerStats.impressions"), stats?.impressions],
    [t("organizerStats.views"), stats?.views],
    [t("organizerStats.saves"), stats?.saves],
    [t("organizerStats.registrations"), stats?.registrations],
    [t("organizerStats.confirmed"), stats?.confirmed],
    [t("organizerStats.conversion"), stats?.conversionViewToRegistration != null ? `${stats.conversionViewToRegistration}%` : "—"],
  ];

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.grid}>
        {numbers.map(([label, value]) => (
          <View key={label} style={styles.stat}>
            <Text style={styles.statValue}>{value ?? 0}</Text>
            <Text style={styles.statLabel}>{label}</Text>
          </View>
        ))}
      </View>

      <View style={styles.toolbar}>
        <Button
          title={t("organizerRegistrations.exportCsv")}
          variant="secondary"
          loading={exporting}
          onPress={() => void exportCsv()}
          style={styles.small}
        />
        <Button
          title={t("organizerRegistrations.message")}
          variant="secondary"
          onPress={() => setMessageOpen((v) => !v)}
          style={styles.small}
        />
      </View>

      {messageOpen && (
        <View style={styles.card}>
          <TextInput
            value={messageText}
            onChangeText={setMessageText}
            placeholder={t("organizerRegistrations.messagePlaceholder")}
            placeholderTextColor={colors.muted}
            style={styles.messageInput}
            multiline
          />
          <View style={styles.actions}>
            <Button
              title={t("organizerRegistrations.messageSend")}
              disabled={messageText.trim().length < 2}
              loading={sendingMessage}
              onPress={() => void sendMessage()}
              style={styles.small}
            />
            <Button title={t("organizerRegistrations.messageCancel")} variant="secondary" onPress={() => setMessageOpen(false)} style={styles.small} />
          </View>
        </View>
      )}

      <Text style={styles.section}>{t("organizerRegistrations.title")}</Text>
      {regs.length === 0 && <Text style={styles.muted}>{t("organizerRegistrations.empty")}</Text>}
      {regs.map((r) => (
        <View key={r.id} style={styles.card}>
          <View style={styles.cardHead}>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{r.user.name ?? r.user.nickname ?? r.user.email}</Text>
              <Text style={styles.muted}>{[r.user.email, r.user.phone].filter(Boolean).join(" · ")}</Text>
            </View>
            <Text style={styles.status}>{t(STATUS_KEYS[r.status] ?? r.status)}</Text>
          </View>
          {r.answers.map((a) => (
            <Text key={a.id} style={styles.answer}>
              <Text style={styles.muted}>{a.field.label}: </Text>
              {answerText(a.valueJson)}
            </Text>
          ))}
          {r.status === "PENDING" && (
            <View style={styles.actions}>
              <Button title={t("organizerRegistrations.approve")} onPress={() => void act(r.id, "approve")} loading={busy === r.id} style={styles.small} />
              <Button title={t("organizerRegistrations.reject")} variant="secondary" onPress={() => void act(r.id, "reject")} loading={busy === r.id} style={styles.small} />
            </View>
          )}
          {r.status === "PAYMENT_PENDING" && (
            <Button title={t("organizerRegistrations.confirmPayment")} onPress={() => void act(r.id, "confirm-payment")} loading={busy === r.id} style={styles.small} />
          )}
          {["REGISTERED", "CONFIRMED", "ATTENDED"].includes(r.status) && (
            <Button
              title={r.checkedInAt ? t("organizerRegistrations.checkOut") : t("organizerRegistrations.checkIn")}
              variant={r.checkedInAt ? "secondary" : "primary"}
              loading={busy === r.id}
              onPress={() => void act(r.id, "check-in")}
              style={styles.small}
            />
          )}
        </View>
      ))}
    </ScrollView>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  stat: { width: "31%", flexGrow: 1, backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, alignItems: "center" },
  statValue: { color: colors.foreground, fontSize: 22, fontWeight: "800" },
  statLabel: { color: colors.muted, fontSize: 11, textAlign: "center", marginTop: 2 },
  section: { color: colors.foreground, fontSize: 16, fontWeight: "700", marginTop: spacing.md },
  toolbar: { flexDirection: "row", gap: spacing.sm, flexWrap: "wrap" },
  messageInput: { backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, color: colors.foreground, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, fontSize: 14, minHeight: 80, textAlignVertical: "top" },
  muted: { color: colors.muted, fontSize: 12 },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, gap: spacing.sm },
  cardHead: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  name: { color: colors.foreground, fontSize: 15, fontWeight: "700" },
  status: { color: colors.accentFrom, fontSize: 12, fontWeight: "700" },
  answer: { color: colors.foreground, fontSize: 13 },
  actions: { flexDirection: "row", gap: spacing.sm },
  small: { minHeight: 38, paddingHorizontal: spacing.lg },
});
