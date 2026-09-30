import { useCallback, useEffect, useState } from "react";
import { router } from "expo-router";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { API_URL, getAccessToken } from "../src/lib/api-client";
import { useAuth } from "../src/lib/auth-context";
import { useTranslations } from "../src/lib/locale-context";
import { Button } from "../src/components/ui/Button";
import { TextField } from "../src/components/ui/TextField";
import { formatShortDate, formatShortDateTime } from "../src/lib/format";
import { radius, spacing, type Palette, useThemedStyles } from "../src/lib/theme";

const ADMINS = ["ADMIN", "SUPER_ADMIN"];
const TABS = ["users", "events", "payments", "credits", "audit", "broadcast"] as const;
type Tab = (typeof TABS)[number];

const USER_STATUSES = ["ACTIVE", "SUSPENDED", "BLOCKED", "DELETED"] as const;
const USER_ROLES = ["USER", "MODERATOR", "ADMIN", "SUPER_ADMIN"] as const;
const EVENT_STATUSES = ["ALL", "DRAFT", "PENDING_MODERATION", "PUBLISHED", "REJECTED", "CANCELLED", "COMPLETED", "ARCHIVED"] as const;

interface AdminUser {
  id: string;
  email: string;
  name: string | null;
  nickname: string | null;
  role: (typeof USER_ROLES)[number];
  status: (typeof USER_STATUSES)[number];
  createdAt: string;
}
interface AdminEvent {
  id: string;
  title: string;
  status: string;
  startsAt: string | null;
  owner: { id: string; name: string | null; nickname: string | null; email: string };
}
interface AdminOrder {
  id: string;
  amount: string;
  currency: string;
  provider: string;
  status: string;
  createdAt: string;
  package: { name: string } | null;
  subscriptionTier: string | null;
  user: { name: string | null; nickname: string | null; email: string };
}
interface AuditEntry {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  createdAt: string;
  actor: { name: string | null; nickname: string | null; email: string } | null;
}

/** §72/§74 Phase 10 mobile parity — users, events, payments, credits, audit, broadcast, all ADMIN+. */
export default function AdminManageScreen() {
  const { colors, styles } = useThemedStyles(makeStyles);
  const { user, isLoading: authLoading } = useAuth();
  const { t } = useTranslations();
  const [tab, setTab] = useState<Tab>("users");
  const [busy, setBusy] = useState<string | null>(null);

  const headers = () => ({ Authorization: `Bearer ${getAccessToken() ?? ""}`, "Content-Type": "application/json" });
  const isSuperAdmin = user?.role === "SUPER_ADMIN";

  // Users
  const [userSearch, setUserSearch] = useState("");
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);

  const loadUsers = useCallback(async (search: string) => {
    const qs = search ? `?search=${encodeURIComponent(search)}` : "";
    const res = await fetch(`${API_URL}/api/v1/admin/users${qs}`, { headers: headers() });
    setUsers(res.ok ? (await res.json()).items : []);
  }, []);

  // Events
  const [eventStatus, setEventStatus] = useState<(typeof EVENT_STATUSES)[number]>("ALL");
  const [events, setEvents] = useState<AdminEvent[] | null>(null);

  const loadEvents = useCallback(async (status: (typeof EVENT_STATUSES)[number]) => {
    const qs = status !== "ALL" ? `?status=${status}` : "";
    const res = await fetch(`${API_URL}/api/v1/admin/events${qs}`, { headers: headers() });
    setEvents(res.ok ? (await res.json()).items : []);
  }, []);

  // Payments
  const [orders, setOrders] = useState<AdminOrder[] | null>(null);
  const loadOrders = useCallback(async () => {
    const res = await fetch(`${API_URL}/api/v1/admin/payments`, { headers: headers() });
    setOrders(res.ok ? await res.json() : []);
  }, []);

  // Credits
  const [creditUserId, setCreditUserId] = useState("");
  const [creditDelta, setCreditDelta] = useState("");
  const [creditDescription, setCreditDescription] = useState("");
  const [creditResult, setCreditResult] = useState<string | null>(null);
  const [creditError, setCreditError] = useState(false);
  const [creditBusy, setCreditBusy] = useState(false);

  // Audit
  const [audit, setAudit] = useState<AuditEntry[] | null>(null);
  const loadAudit = useCallback(async () => {
    const res = await fetch(`${API_URL}/api/v1/admin/audit`, { headers: headers() });
    setAudit(res.ok ? (await res.json()).items : []);
  }, []);

  // Broadcast
  const [bcTitleUk, setBcTitleUk] = useState("");
  const [bcBodyUk, setBcBodyUk] = useState("");
  const [bcTitleEn, setBcTitleEn] = useState("");
  const [bcBodyEn, setBcBodyEn] = useState("");
  const [bcSending, setBcSending] = useState(false);
  const [bcResult, setBcResult] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!user || !ADMINS.includes(user.role)) {
      router.replace("/");
      return;
    }
    void loadUsers("");
    void loadEvents("ALL");
    void loadOrders();
    void loadAudit();
  }, [authLoading, user, loadUsers, loadEvents, loadOrders, loadAudit]);

  async function setUserStatus(id: string, status: string) {
    setBusy(id);
    try {
      await fetch(`${API_URL}/api/v1/admin/users/${id}/status`, { method: "PATCH", headers: headers(), body: JSON.stringify({ status }) });
      await loadUsers(userSearch);
    } finally {
      setBusy(null);
    }
  }

  async function setUserRole(id: string, role: string) {
    setBusy(id);
    try {
      await fetch(`${API_URL}/api/v1/admin/users/${id}/role`, { method: "PATCH", headers: headers(), body: JSON.stringify({ role }) });
      await loadUsers(userSearch);
    } finally {
      setBusy(null);
    }
  }

  function confirmCancelEvent(id: string) {
    Alert.alert(t("admin.events.cancel"), undefined, [
      { text: t("common.cancel"), style: "cancel" },
      { text: t("admin.events.cancel"), style: "destructive", onPress: () => void cancelEvent(id) },
    ]);
  }
  async function cancelEvent(id: string) {
    setBusy(id);
    try {
      await fetch(`${API_URL}/api/v1/admin/events/${id}/cancel`, { method: "POST", headers: headers(), body: JSON.stringify({}) });
      await loadEvents(eventStatus);
    } finally {
      setBusy(null);
    }
  }

  async function confirmManualPayment(orderId: string) {
    setBusy(orderId);
    try {
      await fetch(`${API_URL}/api/v1/payments/orders/${orderId}/confirm-manual`, { method: "PATCH", headers: headers() });
      await loadOrders();
    } finally {
      setBusy(null);
    }
  }

  async function submitCreditAdjustment() {
    const delta = Number(creditDelta);
    if (!creditUserId || !delta || !creditDescription) return;
    setCreditResult(null);
    setCreditError(false);
    setCreditBusy(true);
    try {
      const res = await fetch(`${API_URL}/api/v1/admin/credits/adjust`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ userId: creditUserId, delta, description: creditDescription }),
      });
      if (!res.ok) {
        setCreditError(true);
        return;
      }
      const body = (await res.json()) as { balance: number };
      setCreditResult(`${t("admin.credits.newBalance")}: ${body.balance}`);
      setCreditDelta("");
      setCreditDescription("");
    } catch {
      setCreditError(true);
    } finally {
      setCreditBusy(false);
    }
  }

  function confirmBroadcast() {
    Alert.alert(t("admin.broadcast.send"), t("admin.broadcast.confirm"), [
      { text: t("common.cancel"), style: "cancel" },
      { text: t("admin.broadcast.send"), style: "destructive", onPress: () => void sendBroadcast() },
    ]);
  }
  async function sendBroadcast() {
    setBcSending(true);
    setBcResult(null);
    try {
      const res = await fetch(`${API_URL}/api/v1/admin/notifications/broadcast`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ title: bcTitleUk, body: bcBodyUk, titleEn: bcTitleEn || undefined, bodyEn: bcBodyEn || undefined }),
      });
      if (res.ok) {
        const data = (await res.json()) as { recipients: number };
        setBcResult(`${t("admin.broadcast.sent")}: ${data.recipients}`);
        setBcTitleUk("");
        setBcBodyUk("");
        setBcTitleEn("");
        setBcBodyEn("");
      }
    } finally {
      setBcSending(false);
    }
  }

  if (authLoading || !user) return <ActivityIndicator style={{ flex: 1 }} color={colors.accentFrom} />;

  return (
    <View style={styles.container}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabsRow}>
        {TABS.map((key) => (
          <Pressable key={key} onPress={() => setTab(key)} style={[styles.tab, tab === key && styles.tabOn]}>
            <Text style={[styles.tabText, tab === key && { color: colors.white }]}>{t(`admin.nav.${key}`)}</Text>
          </Pressable>
        ))}
      </ScrollView>

      <ScrollView contentContainerStyle={styles.content}>
        {tab === "users" && (
          <>
            <TextField label={t("admin.users.search")} value={userSearch} onChangeText={setUserSearch} placeholder={t("admin.users.search")} />
            <Button title={t("admin.users.search")} variant="secondary" onPress={() => void loadUsers(userSearch)} style={styles.small} />
            {users === null && <ActivityIndicator color={colors.accentFrom} />}
            {users?.length === 0 && <Text style={styles.muted}>{t("admin.emptyList")}</Text>}
            {users?.map((u) => {
              const expanded = expandedUserId === u.id;
              return (
                <Pressable key={u.id} style={styles.card} onPress={() => setExpandedUserId(expanded ? null : u.id)}>
                  <Text style={styles.title}>{u.name ?? u.nickname ?? u.email}</Text>
                  <Text style={styles.muted}>
                    {u.email} · {u.role} · {u.status}
                  </Text>
                  <Text style={styles.muted}>
                    {t("admin.users.memberSince")} {formatShortDate(u.createdAt)}
                  </Text>
                  {expanded && (
                    <View style={{ gap: spacing.sm, marginTop: spacing.sm }}>
                      <Text style={styles.label}>{t("admin.users.setStatus")}</Text>
                      <View style={styles.pillRow}>
                        {USER_STATUSES.map((s) => (
                          <Pressable
                            key={s}
                            disabled={busy === u.id}
                            onPress={() => void setUserStatus(u.id, s)}
                            style={[styles.pill, u.status === s && styles.pillOn]}
                          >
                            <Text style={[styles.pillText, u.status === s && { color: colors.white }]}>{s}</Text>
                          </Pressable>
                        ))}
                      </View>
                      {isSuperAdmin && (
                        <>
                          <Text style={styles.label}>{t("admin.users.changeRole")}</Text>
                          <View style={styles.pillRow}>
                            {USER_ROLES.map((r) => (
                              <Pressable
                                key={r}
                                disabled={busy === u.id}
                                onPress={() => void setUserRole(u.id, r)}
                                style={[styles.pill, u.role === r && styles.pillOn]}
                              >
                                <Text style={[styles.pillText, u.role === r && { color: colors.white }]}>{r}</Text>
                              </Pressable>
                            ))}
                          </View>
                        </>
                      )}
                    </View>
                  )}
                </Pressable>
              );
            })}
          </>
        )}

        {tab === "events" && (
          <>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pillRow}>
              {EVENT_STATUSES.map((s) => (
                <Pressable
                  key={s}
                  onPress={() => {
                    setEventStatus(s);
                    void loadEvents(s);
                  }}
                  style={[styles.pill, eventStatus === s && styles.pillOn]}
                >
                  <Text style={[styles.pillText, eventStatus === s && { color: colors.white }]}>{s === "ALL" ? t("admin.events.all") : s}</Text>
                </Pressable>
              ))}
            </ScrollView>
            {events === null && <ActivityIndicator color={colors.accentFrom} />}
            {events?.length === 0 && <Text style={styles.muted}>{t("admin.emptyList")}</Text>}
            {events?.map((e) => (
              <View key={e.id} style={styles.card}>
                <Text style={styles.title}>{e.title}</Text>
                <Text style={styles.muted}>
                  {e.owner.name ?? e.owner.nickname ?? e.owner.email} · {e.status}
                </Text>
                {e.startsAt && <Text style={styles.muted}>{formatShortDateTime(e.startsAt)}</Text>}
                {e.status !== "CANCELLED" && (
                  <Button title={t("admin.events.cancel")} variant="danger" loading={busy === e.id} onPress={() => confirmCancelEvent(e.id)} style={styles.small} />
                )}
              </View>
            ))}
          </>
        )}

        {tab === "payments" && (
          <>
            {orders === null && <ActivityIndicator color={colors.accentFrom} />}
            {orders?.length === 0 && <Text style={styles.muted}>{t("admin.emptyList")}</Text>}
            {orders?.map((o) => (
              <View key={o.id} style={styles.card}>
                <Text style={styles.title}>{o.user.name ?? o.user.nickname ?? o.user.email}</Text>
                <Text style={styles.muted}>
                  {o.package?.name ?? `${t("admin.payments.subscriptionLabel")} ${o.subscriptionTier}`} · {o.provider}
                </Text>
                <Text style={styles.muted}>{formatShortDateTime(o.createdAt)}</Text>
                <Text style={styles.muted}>
                  {o.amount} {o.currency} · {o.status}
                </Text>
                {o.provider === "MANUAL_IBAN" && o.status === "PENDING" && (
                  <Button title={t("admin.payments.confirmManual")} loading={busy === o.id} onPress={() => void confirmManualPayment(o.id)} style={styles.small} />
                )}
              </View>
            ))}
          </>
        )}

        {tab === "credits" && (
          <View style={{ gap: spacing.md }}>
            <TextField label={t("admin.credits.userId")} value={creditUserId} onChangeText={setCreditUserId} autoCapitalize="none" />
            <TextField label={t("admin.credits.delta")} value={creditDelta} onChangeText={setCreditDelta} keyboardType="numeric" />
            <TextField label={t("admin.credits.description")} value={creditDescription} onChangeText={setCreditDescription} multiline />
            {creditError && <Text style={styles.error}>{t("credits.error")}</Text>}
            {creditResult && <Text style={styles.muted}>{creditResult}</Text>}
            <Button
              title={t("admin.credits.adjust")}
              loading={creditBusy}
              disabled={!creditUserId || !Number(creditDelta) || !creditDescription}
              onPress={() => void submitCreditAdjustment()}
            />
          </View>
        )}

        {tab === "audit" && (
          <>
            {audit === null && <ActivityIndicator color={colors.accentFrom} />}
            {audit !== null && audit.length === 0 && <Text style={styles.muted}>{t("admin.audit.empty")}</Text>}
            {audit?.map((a) => (
              <View key={a.id} style={styles.card}>
                <Text style={styles.title}>{a.action}</Text>
                <Text style={styles.muted}>
                  {a.entityType} · {a.entityId}
                </Text>
                <Text style={styles.muted}>{formatShortDateTime(a.createdAt)}</Text>
                {a.actor && <Text style={styles.muted}>{a.actor.name ?? a.actor.nickname ?? a.actor.email}</Text>}
              </View>
            ))}
          </>
        )}

        {tab === "broadcast" && (
          <View style={{ gap: spacing.md }}>
            <Text style={styles.muted}>{t("admin.broadcast.hint")}</Text>
            <TextField label={t("admin.broadcast.titleUk")} value={bcTitleUk} onChangeText={setBcTitleUk} />
            <TextField label={t("admin.broadcast.bodyUk")} value={bcBodyUk} onChangeText={setBcBodyUk} multiline />
            <TextField label={t("admin.broadcast.titleEn")} value={bcTitleEn} onChangeText={setBcTitleEn} />
            <TextField label={t("admin.broadcast.bodyEn")} value={bcBodyEn} onChangeText={setBcBodyEn} multiline />
            {bcResult && <Text style={styles.muted}>{bcResult}</Text>}
            <Button title={t("admin.broadcast.send")} loading={bcSending} disabled={bcTitleUk.length < 2 || bcBodyUk.length < 2} onPress={confirmBroadcast} />
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  tabsRow: { gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  tab: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: radius.full, borderWidth: 1, borderColor: colors.border },
  tabOn: { backgroundColor: colors.accentFrom, borderColor: "transparent" },
  tabText: { color: colors.foreground, fontWeight: "700", fontSize: 13 },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, gap: spacing.xs },
  title: { color: colors.foreground, fontSize: 14, fontWeight: "700" },
  muted: { color: colors.muted, fontSize: 12 },
  label: { color: colors.foreground, fontSize: 12, fontWeight: "600" },
  error: { color: colors.danger, fontSize: 13 },
  small: { minHeight: 38, paddingHorizontal: spacing.lg, alignSelf: "flex-start" },
  pillRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  pill: { paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: radius.full, borderWidth: 1, borderColor: colors.border },
  pillOn: { backgroundColor: colors.accentFrom, borderColor: "transparent" },
  pillText: { color: colors.foreground, fontSize: 11, fontWeight: "600" },
});
