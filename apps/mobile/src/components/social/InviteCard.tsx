import { useEffect, useState } from "react";
import { Pressable, Share, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { API_URL, getAccessToken } from "../../lib/api-client";
import { useTranslations } from "../../lib/locale-context";
import { formatShortDateTime } from "../../lib/format";
import { radius, spacing, type Palette, useThemedStyles } from "../../lib/theme";

interface Action {
  at: string;
  device: "ANDROID" | "IPHONE" | "DESKTOP" | "OTHER";
}
interface MyInvites {
  code: string;
  link: string;
  clicks: number;
  downloadClicks: number;
  total: number;
  organizers: number;
  invited: { id: string; name: string; joinedAt: string; isOrganizer: boolean; eventsPublished: number }[];
  visits: Action[];
  downloads: Action[];
}
type Kind = "visits" | "downloads" | "people" | "organizers";

/** "Invite organizers": the person's own link (share) and what came of it. Tap a number to see the list behind it. */
export function InviteCard() {
  const { colors, styles } = useThemedStyles(makeStyles);
  const { t } = useTranslations();
  const [data, setData] = useState<MyInvites | null>(null);
  const [open, setOpen] = useState<Kind | null>(null);

  useEffect(() => {
    void (async () => {
      const res = await fetch(`${API_URL}/api/v1/users/me/invites`, { headers: { Authorization: `Bearer ${getAccessToken() ?? ""}` } }).catch(() => null);
      if (res?.ok) setData((await res.json()) as MyInvites);
    })();
  }, []);

  if (!data) return null;

  const stat = (kind: Kind, value: number, label: string) => (
    <Pressable key={kind} onPress={() => setOpen(open === kind ? null : kind)} style={[styles.stat, open === kind && { backgroundColor: colors.accentFrom }]} accessibilityRole="button" accessibilityState={{ expanded: open === kind }}>
      <Text style={[styles.statValue, open === kind && { color: colors.white }]}>{value}</Text>
      <Text style={[styles.statLabel, open === kind && { color: colors.white }]} numberOfLines={2}>
        {label}
      </Text>
    </Pressable>
  );

  const listTitle: Record<Kind, string> = {
    visits: t("admin.invites.listVisits"),
    downloads: t("admin.invites.listDownloads"),
    people: t("admin.invites.listPeople"),
    organizers: t("admin.invites.listOrganizers"),
  };

  function renderList(kind: Kind) {
    if (kind === "visits" || kind === "downloads") {
      const list = kind === "visits" ? data!.visits : data!.downloads;
      const total = kind === "visits" ? data!.clicks : data!.downloadClicks;
      return (
        <>
          {list.length === 0 && <Text style={styles.muted}>{t("admin.invites.emptyList")}</Text>}
          {list.map((a, i) => (
            <View key={`${a.at}-${i}`} style={styles.line}>
              <Text style={styles.lineText}>{formatShortDateTime(a.at)}</Text>
              <Text style={styles.muted}>{t(`admin.invites.device${a.device}`)}</Text>
            </View>
          ))}
          {total > list.length ? <Text style={styles.muted}>{t("admin.invites.olderWithoutDetails").replace("{n}", String(total - list.length))}</Text> : null}
        </>
      );
    }
    const people = kind === "organizers" ? data!.invited.filter((p) => p.isOrganizer) : data!.invited;
    return (
      <>
        {people.length === 0 && <Text style={styles.muted}>{t("admin.invites.emptyList")}</Text>}
        {people.map((p) => (
          <View key={p.id} style={styles.line}>
            <Text style={[styles.lineText, { flex: 1 }]} numberOfLines={1}>
              {p.name}
            </Text>
            <Text style={styles.muted}>
              {formatShortDateTime(p.joinedAt)}
              {p.isOrganizer ? ` · ${p.eventsPublished} ${t("admin.invites.events")}` : ""}
            </Text>
          </View>
        ))}
      </>
    );
  }

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
        {stat("visits", data.clicks, t("admin.invites.clicks"))}
        {stat("downloads", data.downloadClicks, t("admin.invites.downloadClicks"))}
        {stat("people", data.total, t("admin.invites.joined"))}
        {stat("organizers", data.organizers, t("admin.invites.organizers"))}
      </View>
      {open ? (
        <View style={styles.list}>
          <Text style={styles.listTitle}>{listTitle[open]}</Text>
          {renderList(open)}
        </View>
      ) : (
        <Text style={styles.muted}>{data.total === 0 ? t("admin.invites.empty") : t("admin.invites.tapNumber")}</Text>
      )}
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
    buttonPrimary: { backgroundColor: colors.accentFrom },
    buttonText: { color: colors.foreground, fontSize: 14, fontWeight: "700" },
    stats: { flexDirection: "row", gap: spacing.xs },
    stat: { flex: 1, backgroundColor: colors.background, borderRadius: radius.md, paddingVertical: spacing.sm, paddingHorizontal: 4, alignItems: "center" },
    statValue: { color: colors.foreground, fontSize: 18, fontWeight: "800" },
    statLabel: { color: colors.muted, fontSize: 10, textAlign: "center" },
    list: { gap: spacing.xs, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, paddingTop: spacing.sm },
    listTitle: { color: colors.foreground, fontSize: 13, fontWeight: "700" },
    line: { flexDirection: "row", justifyContent: "space-between", gap: spacing.md, backgroundColor: colors.background, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.xs + 2 },
    lineText: { color: colors.foreground, fontSize: 13, fontWeight: "600" },
  });
