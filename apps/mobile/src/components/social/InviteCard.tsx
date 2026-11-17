import { useEffect, useState } from "react";
import { Pressable, Share, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { API_URL, getAccessToken } from "../../lib/api-client";
import { useTranslations } from "../../lib/locale-context";
import { radius, spacing, type Palette, useThemedStyles } from "../../lib/theme";

interface MyInvites {
  code: string;
  link: string;
  clicks: number;
  total: number;
  organizers: number;
}

/** "Invite organizers": the person's own link (copy / share) and what came of it: opened, signed up, became organizers. */
export function InviteCard() {
  const { colors, styles } = useThemedStyles(makeStyles);
  const { t } = useTranslations();
  const [data, setData] = useState<MyInvites | null>(null);

  useEffect(() => {
    void (async () => {
      const res = await fetch(`${API_URL}/api/v1/users/me/invites`, { headers: { Authorization: `Bearer ${getAccessToken() ?? ""}` } }).catch(() => null);
      if (res?.ok) setData((await res.json()) as MyInvites);
    })();
  }, []);

  if (!data) return null;

  const stat = (value: number, label: string) => (
    <View key={label} style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );

  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <View style={styles.badge}>
          <Ionicons name="person-add" size={20} color={colors.white} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{t("admin.invites.title")}</Text>
          <Text style={styles.muted}>{t("admin.invites.subtitle")}</Text>
        </View>
      </View>
      <Text style={styles.link} selectable>
        {data.link}
      </Text>
      <View style={styles.buttons}>
        <Pressable onPress={() => void Share.share({ message: `${t("admin.invites.shareText")} ${data.link}` })} style={[styles.button, styles.buttonPrimary]}>
          <Ionicons name="share-social-outline" size={16} color={colors.white} />
          <Text style={[styles.buttonText, { color: colors.white }]}>{t("admin.invites.share")}</Text>
        </Pressable>
      </View>
      <View style={styles.stats}>
        {stat(data.clicks, t("admin.invites.clicks"))}
        {stat(data.total, t("admin.invites.joined"))}
        {stat(data.organizers, t("admin.invites.organizers"))}
      </View>
      {data.total === 0 ? <Text style={styles.muted}>{t("admin.invites.empty")}</Text> : null}
    </View>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.md },
    head: { flexDirection: "row", alignItems: "center", gap: spacing.md },
    badge: { width: 40, height: 40, borderRadius: radius.md, backgroundColor: colors.accentFrom, alignItems: "center", justifyContent: "center" },
    title: { color: colors.foreground, fontSize: 15, fontWeight: "700" },
    muted: { color: colors.muted, fontSize: 12 },
    link: { color: colors.foreground, fontSize: 14, fontWeight: "600", backgroundColor: colors.background, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
    buttons: { flexDirection: "row", gap: spacing.sm },
    button: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: spacing.sm + 2, borderRadius: radius.md },
    buttonGhost: { borderWidth: 1, borderColor: colors.border },
    buttonPrimary: { backgroundColor: colors.accentFrom },
    buttonText: { color: colors.foreground, fontSize: 14, fontWeight: "700" },
    stats: { flexDirection: "row", gap: spacing.sm },
    stat: { flex: 1, backgroundColor: colors.background, borderRadius: radius.md, paddingVertical: spacing.sm, alignItems: "center" },
    statValue: { color: colors.foreground, fontSize: 18, fontWeight: "800" },
    statLabel: { color: colors.muted, fontSize: 11, textAlign: "center" },
  });
