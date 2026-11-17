import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { API_URL, getAccessToken } from "../../lib/api-client";
import { useTranslations } from "../../lib/locale-context";
import { formatShortDateTime } from "../../lib/format";
import { radius, spacing, type Palette, useThemedStyles } from "../../lib/theme";
import { AdminLoader } from "./AdminLoader";

interface Person {
  id: string;
  name: string;
  email: string;
  joinedAt: string;
  isOrganizer: boolean;
  eventsPublished: number;
}
interface InviterRow {
  inviter: { id: string; name: string; email: string };
  clicks: number;
  invited: number;
  organizers: number;
  people: Person[];
}
interface Overview {
  inviters: InviterRow[];
  totals: { inviters: number; invited: number; organizers: number };
}

/** Who invited whom: each person with a personal link, how many opened it, signed up and became organizers. Tap a row for the people. */
export function InvitesPanel() {
  const { styles } = useThemedStyles(makeStyles);
  const { t } = useTranslations();
  const [data, setData] = useState<Overview | null>(null);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const res = await fetch(`${API_URL}/api/v1/admin/invites`, { headers: { Authorization: `Bearer ${getAccessToken() ?? ""}` } }).catch(() => null);
      if (res?.ok) setData((await res.json()) as Overview);
      else setFailed(true);
    })();
  }, []);

  if (failed) return <Text style={styles.error}>{t("common.somethingWentWrong")}</Text>;
  if (!data) return <AdminLoader />;

  return (
    <View style={{ gap: spacing.md }}>
      <Text style={styles.heading}>{t("admin.invites.adminTitle")}</Text>
      <Text style={styles.muted}>{t("admin.invites.adminHint")}</Text>
      <Text style={styles.total}>
        {t("admin.invites.adminTotals").replace("{inviters}", String(data.totals.inviters)).replace("{invited}", String(data.totals.invited)).replace("{organizers}", String(data.totals.organizers))}
      </Text>
      {data.inviters.length === 0 && <Text style={styles.muted}>{t("admin.invites.adminEmpty")}</Text>}
      {data.inviters.map((row) => (
        <Pressable key={row.inviter.id} style={styles.card} onPress={() => setOpen(open === row.inviter.id ? null : row.inviter.id)}>
          <View style={styles.headRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.name} numberOfLines={1}>
                {row.inviter.name}
              </Text>
              <Text style={styles.muted} numberOfLines={1}>
                {row.inviter.email}
              </Text>
            </View>
            <Text style={styles.counts}>
              {row.clicks} · {row.invited} · {row.organizers}
            </Text>
          </View>
          <Text style={styles.muted}>
            {t("admin.invites.linkClicks")} · {t("admin.invites.people")} · {t("admin.invites.organizerBadge")}
          </Text>
          {open === row.inviter.id &&
            row.people.map((p) => (
              <View key={p.id} style={styles.person}>
                <Text style={styles.personName}>{p.name}</Text>
                <Text style={styles.muted}>
                  {p.email} · {formatShortDateTime(p.joinedAt)}
                  {p.isOrganizer ? ` · ${t("admin.invites.organizerBadge")} (${p.eventsPublished} ${t("admin.invites.events")})` : ""}
                </Text>
              </View>
            ))}
        </Pressable>
      ))}
    </View>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    heading: { color: colors.foreground, fontSize: 16, fontWeight: "800", marginTop: spacing.lg },
    muted: { color: colors.muted, fontSize: 12 },
    error: { color: colors.danger, fontSize: 13 },
    total: { color: colors.foreground, fontSize: 13, fontWeight: "600" },
    card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, gap: 4 },
    headRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
    name: { color: colors.foreground, fontSize: 14, fontWeight: "700" },
    counts: { color: colors.foreground, fontSize: 16, fontWeight: "800" },
    person: { gap: 2, paddingTop: spacing.xs, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
    personName: { color: colors.foreground, fontSize: 13, fontWeight: "600" },
  });
