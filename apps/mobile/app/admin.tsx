import { useCallback, useEffect, useState } from "react";
import { router } from "expo-router";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { API_URL, getAccessToken } from "../src/lib/api-client";
import { useAuth } from "../src/lib/auth-context";
import { useTranslations } from "../src/lib/locale-context";
import { Button } from "../src/components/ui/Button";
import { radius, spacing, type Palette, useThemedStyles } from "../src/lib/theme";

interface ModerationCase {
  id: string;
  targetType: string;
  targetId: string;
  reasonCode: string;
  details: string | null;
  createdAt: string;
}
interface AdminReview {
  id: string;
  rating: number;
  text: string | null;
  status: "PUBLISHED" | "HIDDEN" | "REMOVED";
  event: { title: string };
  author: { name: string | null; nickname: string | null };
}
interface AdminReport {
  id: string;
  targetType: string;
  targetId: string;
  reason: string;
  description: string | null;
  createdAt: string;
  reporter: { name: string | null; nickname: string | null; email: string };
}

const STAFF = ["MODERATOR", "ADMIN", "SUPER_ADMIN"];

/** Moderator toolbox on mobile: pre-publish moderation queue, review moderation, and user reports (§53, §37, §39, §72). */
export default function AdminScreen() {
  const { colors, styles } = useThemedStyles(makeStyles);
  const { user, isLoading } = useAuth();
  const { t } = useTranslations();
  const [tab, setTab] = useState<"moderation" | "reviews" | "reports">("moderation");
  const [cases, setCases] = useState<ModerationCase[] | null>(null);
  const [reviews, setReviews] = useState<AdminReview[] | null>(null);
  const [reports, setReports] = useState<AdminReport[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const headers = () => ({ Authorization: `Bearer ${getAccessToken() ?? ""}`, "Content-Type": "application/json" });

  const load = useCallback(async () => {
    const [m, r, rep] = await Promise.all([
      fetch(`${API_URL}/api/v1/admin/moderation`, { headers: headers() }),
      fetch(`${API_URL}/api/v1/admin/reviews?status=PUBLISHED`, { headers: headers() }),
      fetch(`${API_URL}/api/v1/admin/reports?status=OPEN`, { headers: headers() }),
    ]);
    setCases(m.ok ? await m.json() : []);
    setReviews(r.ok ? (await r.json()).items : []);
    setReports(rep.ok ? (await rep.json()).items : []);
  }, []);

  useEffect(() => {
    if (isLoading) return;
    if (!user || !STAFF.includes(user.role)) {
      router.replace("/");
      return;
    }
    void load();
  }, [isLoading, user, load]);

  async function decide(id: string, action: "approve" | "reject") {
    setBusy(id);
    try {
      await fetch(`${API_URL}/api/v1/admin/moderation/${id}/${action}`, { method: "PATCH", headers: headers() });
      await load();
    } finally {
      setBusy(null);
    }
  }

  async function setReviewStatus(id: string, status: "HIDDEN" | "REMOVED") {
    setBusy(id);
    try {
      await fetch(`${API_URL}/api/v1/admin/reviews/${id}`, { method: "PATCH", headers: headers(), body: JSON.stringify({ status }) });
      await load();
    } finally {
      setBusy(null);
    }
  }

  async function resolveReport(id: string, status: "RESOLVED" | "DISMISSED", hideTarget: boolean) {
    setBusy(id);
    try {
      await fetch(`${API_URL}/api/v1/admin/reports/${id}/resolve`, { method: "PATCH", headers: headers(), body: JSON.stringify({ status, hideTarget }) });
      setReports((prev) => (prev ? prev.filter((r) => r.id !== id) : prev));
    } finally {
      setBusy(null);
    }
  }

  if (cases === null || reviews === null || reports === null) return <ActivityIndicator style={{ flex: 1 }} color={colors.accentFrom} />;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.tabs}>
        {(["moderation", "reviews", "reports"] as const).map((key) => (
          <Pressable key={key} onPress={() => setTab(key)} style={[styles.tab, tab === key && styles.tabOn]}>
            <Text style={[styles.tabText, tab === key && { color: colors.white }]}>{t(`admin.nav.${key}`)}</Text>
          </Pressable>
        ))}
      </View>

      {tab === "moderation" && (
        <>
          {cases.length === 0 && <Text style={styles.muted}>{t("common.empty")}</Text>}
          {cases.map((c) => (
            <View key={c.id} style={styles.card}>
              <Text style={styles.title}>
                {c.targetType} · {c.reasonCode}
              </Text>
              {c.details ? <Text style={styles.muted}>{c.details}</Text> : null}
              <View style={styles.actions}>
                <Button title={t("organizerRegistrations.approve")} onPress={() => void decide(c.id, "approve")} loading={busy === c.id} style={styles.small} />
                <Button title={t("organizerRegistrations.reject")} variant="secondary" onPress={() => void decide(c.id, "reject")} loading={busy === c.id} style={styles.small} />
              </View>
            </View>
          ))}
        </>
      )}

      {tab === "reviews" && (
        <>
          {reviews.length === 0 && <Text style={styles.muted}>{t("common.empty")}</Text>}
          {reviews.map((r) => (
            <View key={r.id} style={styles.card}>
              <Text style={styles.title}>
                {r.event.title} · {"⭐".repeat(r.rating)}
              </Text>
              <Text style={styles.muted}>{r.author.name ?? r.author.nickname ?? "—"}</Text>
              {r.text ? <Text style={styles.body}>{r.text}</Text> : null}
              <View style={styles.actions}>
                <Button title={t("admin.reviews.hide")} variant="secondary" onPress={() => void setReviewStatus(r.id, "HIDDEN")} loading={busy === r.id} style={styles.small} />
                <Button title={t("admin.reviews.remove")} variant="danger" onPress={() => void setReviewStatus(r.id, "REMOVED")} loading={busy === r.id} style={styles.small} />
              </View>
            </View>
          ))}
        </>
      )}

      {tab === "reports" && (
        <>
          {reports.length === 0 && <Text style={styles.muted}>{t("admin.reports.empty")}</Text>}
          {reports.map((r) => (
            <View key={r.id} style={styles.card}>
              <Text style={styles.title}>
                {t("admin.reports.target")}: {r.targetType} ({r.targetId})
              </Text>
              <Text style={styles.body}>{r.reason}</Text>
              {r.description ? <Text style={styles.muted}>{r.description}</Text> : null}
              <Text style={styles.muted}>{r.reporter.name ?? r.reporter.nickname ?? r.reporter.email}</Text>
              <View style={styles.actions}>
                <Button title={`${t("admin.reports.resolve")} + ${t("admin.reports.hideTarget")}`} onPress={() => void resolveReport(r.id, "RESOLVED", true)} loading={busy === r.id} style={styles.small} />
                <Button title={t("admin.reports.resolve")} variant="secondary" onPress={() => void resolveReport(r.id, "RESOLVED", false)} loading={busy === r.id} style={styles.small} />
                <Button title={t("admin.reports.dismiss")} variant="secondary" onPress={() => void resolveReport(r.id, "DISMISSED", false)} loading={busy === r.id} style={styles.small} />
              </View>
            </View>
          ))}
        </>
      )}
    </ScrollView>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl },
  tabs: { flexDirection: "row", gap: spacing.sm },
  tab: { flex: 1, alignItems: "center", paddingVertical: spacing.md, borderRadius: radius.full, borderWidth: 1, borderColor: colors.border },
  tabOn: { backgroundColor: colors.accentFrom, borderColor: "transparent" },
  tabText: { color: colors.foreground, fontWeight: "700", fontSize: 13 },
  muted: { color: colors.muted, fontSize: 13 },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, gap: spacing.sm },
  title: { color: colors.foreground, fontSize: 14, fontWeight: "700" },
  body: { color: colors.foreground, fontSize: 13 },
  actions: { flexDirection: "row", gap: spacing.sm },
  small: { minHeight: 38, paddingHorizontal: spacing.lg },
});
