import { useCallback, useEffect, useState } from "react";
import { router, Stack } from "expo-router";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import { API_URL, getAccessToken } from "../src/lib/api-client";
import { useAuth } from "../src/lib/auth-context";
import { useTranslations } from "../src/lib/locale-context";
import { Button } from "../src/components/ui/Button";
import { colors, radius, spacing } from "../src/lib/theme";

interface PendingCategory {
  id: string;
  nameUk: string;
  status: string;
}
interface PendingDistrict {
  id: string;
  cityId: string;
  nameUk: string;
  status: string;
}
interface Report {
  id: string;
  targetType: string;
  targetId: string;
  reason: string;
  status: string;
}

const ADMINS = ["ADMIN", "SUPER_ADMIN"];

/**
 * Admin approvals + reports on mobile (web: /admin/categories, /admin/districts, /admin/reports).
 * The create-event flow lets any user suggest a category/district; those stay PENDING — invisible to everyone
 * else — until someone approves them here, so without this screen they'd never surface.
 */
export default function AdminContentScreen() {
  const { user, isLoading } = useAuth();
  const { t } = useTranslations();
  const [categories, setCategories] = useState<PendingCategory[] | null>(null);
  const [districts, setDistricts] = useState<PendingDistrict[] | null>(null);
  const [cityNames, setCityNames] = useState<Record<string, string>>({});
  const [reports, setReports] = useState<Report[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const headers = () => ({ Authorization: `Bearer ${getAccessToken() ?? ""}`, "Content-Type": "application/json" });

  const load = useCallback(async () => {
    const [c, d, r, cities] = await Promise.all([
      fetch(`${API_URL}/api/v1/admin/categories`, { headers: headers() }),
      fetch(`${API_URL}/api/v1/admin/districts`, { headers: headers() }),
      fetch(`${API_URL}/api/v1/admin/reports?status=OPEN`, { headers: headers() }),
      fetch(`${API_URL}/api/v1/geography/cities`),
    ]);
    setCategories(c.ok ? ((await c.json()) as PendingCategory[]).filter((x) => x.status === "PENDING") : []);
    setDistricts(d.ok ? ((await d.json()) as PendingDistrict[]).filter((x) => x.status === "PENDING") : []);
    setReports(r.ok ? ((await r.json()) as { items: Report[] }).items : []);
    if (cities.ok) {
      const list = (await cities.json()) as { id: string; nameUk: string }[];
      setCityNames(Object.fromEntries(list.map((x) => [x.id, x.nameUk])));
    }
  }, []);

  useEffect(() => {
    if (isLoading) return;
    if (!user || !ADMINS.includes(user.role)) {
      router.replace("/");
      return;
    }
    void load();
  }, [isLoading, user, load]);

  async function setStatus(kind: "categories" | "districts", id: string, status: "ACTIVE" | "ARCHIVED") {
    setBusy(id);
    try {
      const res = await fetch(`${API_URL}/api/v1/admin/${kind}/${id}`, { method: "PATCH", headers: headers(), body: JSON.stringify({ status }) });
      if (res.ok) {
        if (kind === "categories") setCategories((prev) => (prev ?? []).filter((x) => x.id !== id));
        else setDistricts((prev) => (prev ?? []).filter((x) => x.id !== id));
      }
    } finally {
      setBusy(null);
    }
  }

  async function resolve(id: string, status: "RESOLVED" | "DISMISSED") {
    setBusy(id);
    try {
      const res = await fetch(`${API_URL}/api/v1/admin/reports/${id}/resolve`, { method: "PATCH", headers: headers(), body: JSON.stringify({ status }) });
      if (res.ok) setReports((prev) => (prev ?? []).filter((x) => x.id !== id));
    } finally {
      setBusy(null);
    }
  }

  const loading = categories === null || districts === null || reports === null;

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: t("adminContent.title"), headerStyle: { backgroundColor: colors.background }, headerTintColor: colors.foreground }} />
      {loading && <ActivityIndicator color={colors.accentFrom} />}

      {!loading && (
        <>
          <Text style={styles.section}>{t("adminContent.categories")}</Text>
          {categories.length === 0 && <Text style={styles.empty}>{t("adminContent.nothing")}</Text>}
          {categories.map((c) => (
            <View key={c.id} style={styles.card}>
              <Text style={styles.name}>{c.nameUk}</Text>
              <View style={styles.actions}>
                <Button title={t("adminContent.approve")} loading={busy === c.id} onPress={() => void setStatus("categories", c.id, "ACTIVE")} style={styles.action} />
                <Button title={t("adminContent.reject")} variant="secondary" loading={busy === c.id} onPress={() => void setStatus("categories", c.id, "ARCHIVED")} style={styles.action} />
              </View>
            </View>
          ))}

          <Text style={styles.section}>{t("adminContent.districts")}</Text>
          {districts.length === 0 && <Text style={styles.empty}>{t("adminContent.nothing")}</Text>}
          {districts.map((d) => (
            <View key={d.id} style={styles.card}>
              <Text style={styles.name}>
                {d.nameUk}
                {cityNames[d.cityId] ? <Text style={styles.sub}>{`  ·  ${cityNames[d.cityId]}`}</Text> : null}
              </Text>
              <View style={styles.actions}>
                <Button title={t("adminContent.approve")} loading={busy === d.id} onPress={() => void setStatus("districts", d.id, "ACTIVE")} style={styles.action} />
                <Button title={t("adminContent.reject")} variant="secondary" loading={busy === d.id} onPress={() => void setStatus("districts", d.id, "ARCHIVED")} style={styles.action} />
              </View>
            </View>
          ))}

          <Text style={styles.section}>{t("adminContent.reports")}</Text>
          {reports.length === 0 && <Text style={styles.empty}>{t("adminContent.nothing")}</Text>}
          {reports.map((r) => (
            <View key={r.id} style={styles.card}>
              <Text style={styles.sub}>{r.targetType}</Text>
              <Text style={styles.name}>{r.reason}</Text>
              <View style={styles.actions}>
                <Button title={t("adminContent.resolved")} loading={busy === r.id} onPress={() => void resolve(r.id, "RESOLVED")} style={styles.action} />
                <Button title={t("adminContent.dismiss")} variant="secondary" loading={busy === r.id} onPress={() => void resolve(r.id, "DISMISSED")} style={styles.action} />
              </View>
            </View>
          ))}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.sm },
  section: { color: colors.muted, fontSize: 12, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.8, marginTop: spacing.md },
  empty: { color: colors.muted, fontSize: 13 },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.sm },
  name: { color: colors.foreground, fontSize: 15, fontWeight: "600" },
  sub: { color: colors.muted, fontSize: 12 },
  actions: { flexDirection: "row", gap: spacing.sm },
  action: { flex: 1 },
});
