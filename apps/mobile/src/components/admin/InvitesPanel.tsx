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
  paid: boolean;
  paidAmount: number;
  events?: { title: string; slug: string; status: string }[];
}
interface InviterRow {
  inviter: { id: string; name: string; email: string };
  clicks: number;
  downloadClicks: number;
  invited: number;
  organizers: number;
  payers: number;
  paidAmount: number;
}
interface Overview {
  inviters: InviterRow[];
  totals: { inviters: number; invited: number; organizers: number; payers: number; paidAmount: number };
}
interface Action {
  at: string;
  device: "ANDROID" | "IPHONE" | "DESKTOP" | "OTHER";
}
interface Details {
  visits: Action[];
  downloads: Action[];
  people: Person[];
}
type Kind = "visits" | "downloads" | "people" | "organizers" | "payers";

const money = (n: number) => new Intl.NumberFormat("uk-UA", { maximumFractionDigits: 0 }).format(n);

const headers = () => ({ Authorization: `Bearer ${getAccessToken() ?? ""}` });

/**
 * Who invited whom. Every number is tappable: it opens the list behind it (each open of the link, each "download" press,
 * the people who signed up, the ones who became organizers).
 */
export function InvitesPanel() {
  const { colors, styles } = useThemedStyles(makeStyles);
  const { t } = useTranslations();
  const [data, setData] = useState<Overview | null>(null);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState<{ id: string; kind: Kind } | null>(null);
  const [details, setDetails] = useState<Record<string, Details | "loading" | "failed">>({});

  useEffect(() => {
    void (async () => {
      const res = await fetch(`${API_URL}/api/v1/admin/invites`, { headers: headers() }).catch(() => null);
      if (res?.ok) setData((await res.json()) as Overview);
      else setFailed(true);
    })();
  }, []);

  async function choose(id: string, kind: Kind) {
    if (open?.id === id && open.kind === kind) {
      setOpen(null);
      return;
    }
    setOpen({ id, kind });
    if (details[id]) return;
    setDetails((prev) => ({ ...prev, [id]: "loading" }));
    const res = await fetch(`${API_URL}/api/v1/admin/invites/${id}`, { headers: headers() }).catch(() => null);
    const body = res?.ok ? ((await res.json()) as Details) : null;
    setDetails((prev) => ({ ...prev, [id]: body ?? "failed" }));
  }

  if (failed) return <Text style={styles.error}>{t("common.somethingWentWrong")}</Text>;
  if (!data) return <AdminLoader />;

  const listTitle: Record<Kind, string> = {
    visits: t("admin.invites.listVisits"),
    downloads: t("admin.invites.listDownloads"),
    people: t("admin.invites.listPeople"),
    organizers: t("admin.invites.listOrganizers"),
    payers: t("admin.invites.listPayers"),
  };

  function renderList(row: InviterRow, kind: Kind) {
    const d = details[row.inviter.id];
    if (d === "loading" || d === undefined) return <AdminLoader />;
    if (d === "failed") return <Text style={styles.error}>{t("common.somethingWentWrong")}</Text>;
    if (kind === "visits" || kind === "downloads") {
      const list = kind === "visits" ? d.visits : d.downloads;
      const total = kind === "visits" ? row.clicks : row.downloadClicks;
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
    const people = kind === "organizers" ? d.people.filter((p) => p.isOrganizer) : kind === "payers" ? d.people.filter((p) => p.paid) : d.people;
    return (
      <>
        {people.length === 0 && <Text style={styles.muted}>{t("admin.invites.emptyList")}</Text>}
        {people.map((p) => (
          <View key={p.id} style={styles.person}>
            <Text style={styles.lineText}>{p.name}</Text>
            <Text style={styles.muted}>
              {p.email} · {formatShortDateTime(p.joinedAt)}
              {kind === "payers" ? ` · ${t("admin.invites.paidAmount").replace("{amount}", money(p.paidAmount))}` : p.isOrganizer ? ` · ${t("admin.invites.organizerBadge")} (${p.eventsPublished} ${t("admin.invites.events")})` : ""}
            </Text>
            {kind === "organizers" ? (p.events ?? []).map((e) => (
              <Text key={e.slug} style={styles.muted} numberOfLines={1}>
                • {e.title}
              </Text>
            )) : null}
          </View>
        ))}
      </>
    );
  }

  const counter = (row: InviterRow, kind: Kind, value: number, label: string) => {
    const active = open?.id === row.inviter.id && open.kind === kind;
    return (
      <Pressable key={kind} onPress={() => void choose(row.inviter.id, kind)} style={[styles.counter, active && { backgroundColor: colors.accentFrom }]} accessibilityRole="button" accessibilityState={{ expanded: active }}>
        <Text style={[styles.counterValue, active && { color: colors.white }]}>{value}</Text>
        <Text style={[styles.counterLabel, active && { color: colors.white }]} numberOfLines={2}>
          {label}
        </Text>
      </Pressable>
    );
  };

  return (
    <View style={{ gap: spacing.md }}>
      <Text style={styles.heading}>{t("admin.invites.adminTitle")}</Text>
      <Text style={styles.muted}>{t("admin.invites.adminHint")}</Text>
      <Text style={styles.muted}>{t("admin.invites.tapNumber")}</Text>
      <Text style={styles.total}>
        {t("admin.invites.adminTotals").replace("{inviters}", String(data.totals.inviters)).replace("{invited}", String(data.totals.invited)).replace("{organizers}", String(data.totals.organizers))}
      </Text>
      <Text style={styles.total}>{t("admin.invites.adminPaid").replace("{payers}", String(data.totals.payers)).replace("{amount}", money(data.totals.paidAmount))}</Text>
      <Text style={styles.muted}>{t("admin.invites.paidNote")}</Text>
      {data.inviters.length === 0 && <Text style={styles.muted}>{t("admin.invites.adminEmpty")}</Text>}
      {data.inviters.map((row) => (
        <View key={row.inviter.id} style={styles.card}>
          <Text style={styles.name} numberOfLines={1}>
            {row.inviter.name}
          </Text>
          <Text style={styles.muted} numberOfLines={1}>
            {row.inviter.email}
          </Text>
          <View style={styles.counters}>
            {counter(row, "visits", row.clicks, t("admin.invites.linkClicks"))}
            {counter(row, "downloads", row.downloadClicks, t("admin.invites.downloadClicks"))}
            {counter(row, "people", row.invited, t("admin.invites.people"))}
            {counter(row, "organizers", row.organizers, t("admin.invites.organizerBadge"))}
            {counter(row, "payers", row.payers, t("admin.invites.payers"))}
          </View>
          {row.payers > 0 ? <Text style={[styles.total, { color: colors.success }]}>{t("admin.invites.paidAmount").replace("{amount}", money(row.paidAmount))}</Text> : null}
          {open?.id === row.inviter.id && (
            <View style={styles.list}>
              <Text style={styles.listTitle}>{listTitle[open.kind]}</Text>
              {renderList(row, open.kind)}
            </View>
          )}
        </View>
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
    card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, gap: spacing.xs },
    name: { color: colors.foreground, fontSize: 14, fontWeight: "700" },
    counters: { flexDirection: "row", gap: spacing.xs, marginTop: spacing.xs },
    counter: { flex: 1, backgroundColor: colors.background, borderRadius: radius.md, paddingVertical: spacing.sm, paddingHorizontal: 4, alignItems: "center" },
    counterValue: { color: colors.foreground, fontSize: 18, fontWeight: "800" },
    counterLabel: { color: colors.muted, fontSize: 10, textAlign: "center" },
    list: { gap: spacing.xs, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, paddingTop: spacing.sm, marginTop: spacing.xs },
    listTitle: { color: colors.foreground, fontSize: 13, fontWeight: "700" },
    line: { flexDirection: "row", justifyContent: "space-between", gap: spacing.md, backgroundColor: colors.background, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.xs + 2 },
    lineText: { color: colors.foreground, fontSize: 13, fontWeight: "600" },
    person: { gap: 2, backgroundColor: colors.background, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.xs + 2 },
  });
