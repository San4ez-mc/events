import { useEffect, useState } from "react";
import { router } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { API_URL, getAccessToken } from "../src/lib/api-client";
import { useTranslations } from "../src/lib/locale-context";
import { Button } from "../src/components/ui/Button";
import { colors, radius, spacing } from "../src/lib/theme";

interface Named {
  id: string;
  nameUk: string;
  nameEn: string;
  children?: Named[];
}

/** UX §2 — first-run onboarding: city, interests, budget preference. Skippable; editable later. */
export default function WelcomeScreen() {
  const { t, locale } = useTranslations();
  const insets = useSafeAreaInsets();
  const [cities, setCities] = useState<Named[]>([]);
  const [categories, setCategories] = useState<Named[]>([]);
  const [cityId, setCityId] = useState<string | null>(null);
  const [categoryIds, setCategoryIds] = useState<string[]>([]);
  const [freeOnly, setFreeOnly] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void (async () => {
      const [c, cat] = await Promise.all([fetch(`${API_URL}/api/v1/geography/cities`), fetch(`${API_URL}/api/v1/categories`)]).catch(() => [null, null] as const);
      if (c?.ok) setCities(await c.json());
      if (cat?.ok) {
        const tree = (await cat.json()) as Named[];
        setCategories(tree.flatMap((n) => (n.children && n.children.length > 0 ? n.children : [n])));
      }
    })();
  }, []);

  const name = (n: Named) => (locale === "uk" ? n.nameUk : n.nameEn);
  const toggleCategory = (id: string) => setCategoryIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));

  async function save() {
    const token = getAccessToken();
    setSaving(true);
    try {
      if (token) {
        await fetch(`${API_URL}/api/v1/users/me/preferences`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ preferredCityId: cityId ?? undefined, preferredCategoryIds: categoryIds, freeOnly }),
        }).catch(() => null);
      }
    } finally {
      setSaving(false);
      router.replace("/");
    }
  }

  const chip = (key: string, label: string, on: boolean, onPress: () => void) => (
    <Pressable key={key} onPress={onPress} style={[styles.chip, on && styles.chipOn]}>
      <Text style={[styles.chipText, on && { color: colors.white }]}>{label}</Text>
    </Pressable>
  );

  return (
    <ScrollView style={styles.container} contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.xl }]}>
      <Text style={styles.title}>{t("welcome.title")}</Text>
      <Text style={styles.subtitle}>{t("welcome.subtitle")}</Text>

      <Text style={styles.section}>{t("welcome.city")}</Text>
      <View style={styles.row}>{cities.map((c) => chip(c.id, name(c), cityId === c.id, () => setCityId(c.id)))}</View>

      <Text style={styles.section}>{t("welcome.interests")}</Text>
      <View style={styles.row}>{categories.map((c) => chip(c.id, name(c), categoryIds.includes(c.id), () => toggleCategory(c.id)))}</View>

      <View style={styles.switchRow}>
        <Text style={styles.switchLabel}>{t("welcome.freeOnly")}</Text>
        <Switch value={freeOnly} onValueChange={setFreeOnly} trackColor={{ true: colors.accentFrom }} />
      </View>

      <Button title={t("welcome.done")} onPress={() => void save()} loading={saving} />
      <Pressable onPress={() => router.replace("/")} style={{ alignItems: "center", padding: spacing.md }}>
        <Text style={styles.skip}>{t("welcome.skip")}</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl },
  title: { color: colors.foreground, fontSize: 26, fontWeight: "800" },
  subtitle: { color: colors.muted, fontSize: 14 },
  section: { color: colors.foreground, fontSize: 15, fontWeight: "700", marginTop: spacing.md },
  row: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  chip: { borderRadius: radius.full, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  chipOn: { backgroundColor: colors.accentFrom, borderColor: "transparent" },
  chipText: { color: colors.foreground, fontSize: 13, fontWeight: "600" },
  switchRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginVertical: spacing.md },
  switchLabel: { color: colors.foreground, fontSize: 14, flex: 1, paddingRight: spacing.md },
  skip: { color: colors.muted, fontSize: 14 },
});
