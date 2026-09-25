import { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { API_URL, getAccessToken } from "../../lib/api-client";
import { useTranslations } from "../../lib/locale-context";
import { colors, radius, spacing } from "../../lib/theme";

interface Sub {
  id: string;
  scope: "EVENT" | "ORGANIZER_CATEGORY" | "ORGANIZER_ALL";
  organizerId: string | null;
  categoryId: string | null;
}
interface Category {
  id: string;
  nameUk: string;
  nameEn: string;
  children?: Category[];
}

/** UX §25 — follow an organizer: every event, or only chosen categories. New events then arrive as notifications. */
export function OrganizerFollow({ organizerId }: { organizerId: string }) {
  const { t, locale } = useTranslations();
  const [subs, setSubs] = useState<Sub[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const token = getAccessToken();
    if (!token) return;
    const res = await fetch(`${API_URL}/api/v1/subscriptions/mine`, { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) setSubs(((await res.json()) as Sub[]).filter((s) => s.organizerId === organizerId));
  }, [organizerId]);

  useEffect(() => {
    void load();
    (async () => {
      const res = await fetch(`${API_URL}/api/v1/categories`);
      if (res.ok) {
        const tree = (await res.json()) as Category[];
        setCategories(tree.flatMap((c) => (c.children && c.children.length > 0 ? c.children : [c])));
      }
    })();
  }, [load]);

  async function toggle(scope: "ORGANIZER_ALL" | "ORGANIZER_CATEGORY", categoryId?: string) {
    const token = getAccessToken();
    if (!token) {
      router.push("/login");
      return;
    }
    setBusy(true);
    try {
      const existing = subs.find((s) => s.scope === scope && (scope === "ORGANIZER_ALL" || s.categoryId === categoryId));
      if (existing) {
        await fetch(`${API_URL}/api/v1/subscriptions/${existing.id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
      } else {
        await fetch(`${API_URL}/api/v1/subscriptions/organizers/${organizerId}`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify(scope === "ORGANIZER_ALL" ? { allEvents: true } : { categoryIds: [categoryId] }),
        });
      }
      await load();
    } finally {
      setBusy(false);
    }
  }

  const allOn = subs.some((s) => s.scope === "ORGANIZER_ALL");
  const chip = (label: string, on: boolean, onPress: () => void) => (
    <Pressable key={label} onPress={onPress} disabled={busy} style={[styles.chip, on && styles.chipOn]}>
      <Text style={[styles.chipText, on && { color: colors.white }]}>{label}</Text>
    </Pressable>
  );

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>{t("subscriptions.followOrganizer")}</Text>
      <View style={styles.row}>
        {chip(t("subscriptions.allEvents"), allOn, () => void toggle("ORGANIZER_ALL"))}
        {categories.map((c) =>
          chip(
            locale === "uk" ? c.nameUk : c.nameEn,
            subs.some((s) => s.scope === "ORGANIZER_CATEGORY" && s.categoryId === c.id),
            () => void toggle("ORGANIZER_CATEGORY", c.id),
          ),
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  title: { color: colors.foreground, fontSize: 15, fontWeight: "700" },
  row: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  chip: { borderRadius: radius.full, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  chipOn: { backgroundColor: colors.accentFrom, borderColor: "transparent" },
  chipText: { color: colors.foreground, fontSize: 13, fontWeight: "600" },
});
