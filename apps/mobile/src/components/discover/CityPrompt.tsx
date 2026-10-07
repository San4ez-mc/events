import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import * as SecureStore from "expo-secure-store";
import { Ionicons } from "@expo/vector-icons";
import { API_URL, getAccessToken } from "../../lib/api-client";
import { useTranslations } from "../../lib/locale-context";
import { radius, spacing, type Palette, useThemedStyles } from "../../lib/theme";

const DISMISSED_KEY = "kiro_city_prompt_dismissed";

interface City {
  id: string;
  nameUk: string;
  nameEn: string;
}

/**
 * Half of the early users skipped the city step of onboarding. Someone signed in with no city gets one gentle,
 * dismissible nudge over the feed: pick a city and nearby events rank first (a ranking preference, not a hard filter).
 */
export function CityPrompt({ top }: { top: number }) {
  const { colors, styles } = useThemedStyles(makeStyles);
  const { t, locale } = useTranslations();
  const [cities, setCities] = useState<City[] | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const token = getAccessToken();
      if (!token) return;
      if (await SecureStore.getItemAsync(DISMISSED_KEY).catch(() => null)) return;
      const prefs = await fetch(`${API_URL}/api/v1/discovery/preferences`, { headers: { Authorization: `Bearer ${token}` } }).catch(() => null);
      if (!prefs?.ok || cancelled) return;
      if ((await prefs.json()).preferredCityId) return;
      const list = await fetch(`${API_URL}/api/v1/geography/cities`).catch(() => null);
      if (list?.ok && !cancelled) setCities(((await list.json()) as City[]).slice(0, 8));
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function dismiss() {
    void SecureStore.setItemAsync(DISMISSED_KEY, "1").catch(() => {});
    setCities(null);
  }

  async function choose(city: City) {
    await fetch(`${API_URL}/api/v1/discovery/preferences`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${getAccessToken() ?? ""}`, "Content-Type": "application/json" },
      body: JSON.stringify({ preferredCityId: city.id }),
    }).catch(() => null);
    setDone(true);
    setTimeout(dismiss, 1800);
  }

  if (!cities || cities.length === 0) return null;

  return (
    <View style={[styles.card, { top }]}>
      <View style={styles.row}>
        <Ionicons name="location-outline" size={22} color={colors.accentFrom} />
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{done ? t("discover.cityPrompt.saved") : t("discover.cityPrompt.title")}</Text>
          {!done && <Text style={styles.text}>{t("discover.cityPrompt.text")}</Text>}
        </View>
        <Pressable onPress={dismiss} hitSlop={10} accessibilityLabel={t("discover.cityPrompt.later")}>
          <Ionicons name="close" size={22} color={colors.muted} />
        </Pressable>
      </View>
      {!done && (
        <View style={styles.chips}>
          {cities.map((c) => (
            <Pressable key={c.id} style={styles.chip} onPress={() => void choose(c)}>
              <Text style={styles.chipText}>{locale === "uk" ? c.nameUk : c.nameEn}</Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    card: { position: "absolute", left: spacing.md, right: spacing.md, zIndex: 20, backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.md },
    row: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
    title: { color: colors.foreground, fontSize: 16, fontWeight: "800" },
    text: { color: colors.muted, fontSize: 14 },
    chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
    chip: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.full, paddingHorizontal: 14, paddingVertical: 7 },
    chipText: { color: colors.foreground, fontSize: 14, fontWeight: "600" },
  });
