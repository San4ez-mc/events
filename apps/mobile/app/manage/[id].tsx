import { useCallback, useEffect, useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import { API_URL, getAccessToken } from "../../src/lib/api-client";
import { useAuth } from "../../src/lib/auth-context";
import { useTranslations } from "../../src/lib/locale-context";
import { Button } from "../../src/components/ui/Button";
import { colors, radius, spacing } from "../../src/lib/theme";

interface Reg {
  id: string;
  status: string;
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
};

const answerText = (v: unknown) => (Array.isArray(v) ? v.join(", ") : typeof v === "boolean" ? (v ? "✓" : "—") : String(v ?? "—"));

/** Organizer tools on mobile: funnel numbers + approve / reject / confirm payment (§26, §35). */
export default function ManageEventScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user, isLoading } = useAuth();
  const { t } = useTranslations();
  const [regs, setRegs] = useState<Reg[] | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const token = getAccessToken();
    if (!token) return;
    const headers = { Authorization: `Bearer ${token}` };
    const [r, s] = await Promise.all([
      fetch(`${API_URL}/api/v1/events/${id}/registrations`, { headers }),
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

  async function act(regId: string, action: "approve" | "reject" | "confirm-payment") {
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
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  stat: { width: "31%", flexGrow: 1, backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, alignItems: "center" },
  statValue: { color: colors.foreground, fontSize: 22, fontWeight: "800" },
  statLabel: { color: colors.muted, fontSize: 11, textAlign: "center", marginTop: 2 },
  section: { color: colors.foreground, fontSize: 16, fontWeight: "700", marginTop: spacing.md },
  muted: { color: colors.muted, fontSize: 12 },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, gap: spacing.sm },
  cardHead: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  name: { color: colors.foreground, fontSize: 15, fontWeight: "700" },
  status: { color: colors.accentFrom, fontSize: 12, fontWeight: "700" },
  answer: { color: colors.foreground, fontSize: 13 },
  actions: { flexDirection: "row", gap: spacing.sm },
  small: { minHeight: 38, paddingHorizontal: spacing.lg },
});
