import { useCallback, useEffect, useState } from "react";
import { router, Stack } from "expo-router";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { API_URL, getAccessToken } from "../src/lib/api-client";
import { useAuth } from "../src/lib/auth-context";
import { useTranslations } from "../src/lib/locale-context";
import { Button } from "../src/components/ui/Button";
import { TextField } from "../src/components/ui/TextField";
import { formatShortDate, formatShortDateTime } from "../src/lib/format";
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
interface Submitter {
  id: string;
  name: string | null;
  nickname: string | null;
  email: string;
}
interface PendingCategory {
  id: string;
  nameUk: string;
  status: string;
  createdByUser: Submitter | null;
}
interface PendingDistrict {
  id: string;
  cityId: string;
  nameUk: string;
  status: string;
  createdByUser: Submitter | null;
}
interface AdminUser {
  id: string;
  email: string;
  name: string | null;
  nickname: string | null;
  role: (typeof USER_ROLES)[number];
  status: (typeof USER_STATUSES)[number];
  createdAt: string;
}
interface UserDetail {
  eventsCount: number;
  registrationsCount: number;
  lastLoginAt: string | null;
}
interface AdminEvent {
  id: string;
  title: string;
  status: string;
  startsAt: string | null;
  isTest: boolean;
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

const MODERATOR_TABS = ["moderation", "reviews", "reports"] as const;
const ADMIN_TABS = ["categories", "districts", "users", "events", "payments", "credits", "audit", "broadcast"] as const;
type Tab = (typeof MODERATOR_TABS)[number] | (typeof ADMIN_TABS)[number];

const USER_STATUSES = ["ACTIVE", "SUSPENDED", "BLOCKED", "DELETED"] as const;
const USER_ROLES = ["USER", "MODERATOR", "ADMIN", "SUPER_ADMIN"] as const;
const EVENT_STATUSES = ["ALL", "DRAFT", "PENDING_MODERATION", "PUBLISHED", "REJECTED", "CANCELLED", "COMPLETED", "ARCHIVED"] as const;
const MODERATOR_ROLES = ["MODERATOR", "ADMIN", "SUPER_ADMIN"];
const ADMIN_ROLES = ["ADMIN", "SUPER_ADMIN"];

function submitterName(u: Submitter | null, fallback: string): string {
  if (!u) return fallback;
  return u.name ?? u.nickname ?? u.email;
}

/**
 * The one admin entry point on mobile — every admin-only screen used to be reachable as its own
 * separate route linked from Profile (admin.tsx / admin-manage.tsx / admin-content.tsx, with
 * admin-content.tsx's own "reports" section duplicating this one's, minus the reporter's name).
 * Merged into a single screen with all sections as internal tabs instead, gated by role: MODERATOR
 * sees moderation/reviews/reports, ADMIN+ additionally sees everything else. Profile now links only
 * here.
 */
export default function AdminScreen() {
  const { colors, styles } = useThemedStyles(makeStyles);
  const { user, isLoading: authLoading } = useAuth();
  const { t } = useTranslations();
  const isAdmin = !!user && ADMIN_ROLES.includes(user.role);
  const tabs: Tab[] = isAdmin ? [...MODERATOR_TABS, ...ADMIN_TABS] : [...MODERATOR_TABS];
  const [tab, setTab] = useState<Tab>("moderation");
  const [busy, setBusy] = useState<string | null>(null);

  const headers = () => ({ Authorization: `Bearer ${getAccessToken() ?? ""}`, "Content-Type": "application/json" });
  const isSuperAdmin = user?.role === "SUPER_ADMIN";

  // Moderation
  const [cases, setCases] = useState<ModerationCase[] | null>(null);
  // Reviews
  const [reviews, setReviews] = useState<AdminReview[] | null>(null);
  // Reports
  const [reports, setReports] = useState<AdminReport[] | null>(null);
  // Categories / districts (pending approval)
  const [categories, setCategories] = useState<PendingCategory[] | null>(null);
  const [districts, setDistricts] = useState<PendingDistrict[] | null>(null);
  const [cityNames, setCityNames] = useState<Record<string, string>>({});
  // Users
  const [userSearch, setUserSearch] = useState("");
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);
  const [userDetails, setUserDetails] = useState<Record<string, UserDetail>>({});
  // Events
  const [eventStatus, setEventStatus] = useState<(typeof EVENT_STATUSES)[number]>("ALL");
  const [events, setEvents] = useState<AdminEvent[] | null>(null);
  // Payments
  const [orders, setOrders] = useState<AdminOrder[] | null>(null);
  // Credits
  const [creditUserId, setCreditUserId] = useState("");
  const [creditDelta, setCreditDelta] = useState("");
  const [creditDescription, setCreditDescription] = useState("");
  const [creditResult, setCreditResult] = useState<string | null>(null);
  const [creditError, setCreditError] = useState(false);
  const [creditBusy, setCreditBusy] = useState(false);
  // Audit
  const [audit, setAudit] = useState<AuditEntry[] | null>(null);
  // Broadcast
  const [bcTitleUk, setBcTitleUk] = useState("");
  const [bcBodyUk, setBcBodyUk] = useState("");
  const [bcTitleEn, setBcTitleEn] = useState("");
  const [bcBodyEn, setBcBodyEn] = useState("");
  const [bcSending, setBcSending] = useState(false);
  const [bcResult, setBcResult] = useState<string | null>(null);

  const loadModeration = useCallback(async () => {
    const [m, r] = await Promise.all([
      fetch(`${API_URL}/api/v1/admin/moderation`, { headers: headers() }),
      fetch(`${API_URL}/api/v1/admin/reviews?status=PUBLISHED`, { headers: headers() }),
    ]);
    setCases(m.ok ? await m.json() : []);
    setReviews(r.ok ? (await r.json()).items : []);
  }, []);

  const loadReports = useCallback(async () => {
    const res = await fetch(`${API_URL}/api/v1/admin/reports?status=OPEN`, { headers: headers() });
    setReports(res.ok ? (await res.json()).items : []);
  }, []);

  const loadContent = useCallback(async () => {
    const [c, d, citiesRes] = await Promise.all([
      fetch(`${API_URL}/api/v1/admin/categories`, { headers: headers() }),
      fetch(`${API_URL}/api/v1/admin/districts`, { headers: headers() }),
      fetch(`${API_URL}/api/v1/geography/cities`),
    ]);
    setCategories(c.ok ? ((await c.json()) as PendingCategory[]).filter((x) => x.status === "PENDING") : []);
    setDistricts(d.ok ? ((await d.json()) as PendingDistrict[]).filter((x) => x.status === "PENDING") : []);
    if (citiesRes.ok) {
      const list = (await citiesRes.json()) as { id: string; nameUk: string }[];
      setCityNames(Object.fromEntries(list.map((x) => [x.id, x.nameUk])));
    }
  }, []);

  const loadUsers = useCallback(async (search: string) => {
    const qs = search ? `?search=${encodeURIComponent(search)}` : "";
    const res = await fetch(`${API_URL}/api/v1/admin/users${qs}`, { headers: headers() });
    setUsers(res.ok ? (await res.json()).items : []);
  }, []);

  async function toggleUserExpanded(id: string) {
    const next = expandedUserId === id ? null : id;
    setExpandedUserId(next);
    if (next && !userDetails[next]) {
      const res = await fetch(`${API_URL}/api/v1/admin/users/${next}`, { headers: headers() });
      if (res.ok) {
        const d = (await res.json()) as UserDetail;
        setUserDetails((prev) => ({ ...prev, [next]: d }));
      }
    }
  }

  const loadEvents = useCallback(async (status: (typeof EVENT_STATUSES)[number]) => {
    const qs = status !== "ALL" ? `?status=${status}` : "";
    const res = await fetch(`${API_URL}/api/v1/admin/events${qs}`, { headers: headers() });
    setEvents(res.ok ? (await res.json()).items : []);
  }, []);

  const loadOrders = useCallback(async () => {
    const res = await fetch(`${API_URL}/api/v1/admin/payments`, { headers: headers() });
    setOrders(res.ok ? await res.json() : []);
  }, []);

  const loadAudit = useCallback(async () => {
    const res = await fetch(`${API_URL}/api/v1/admin/audit`, { headers: headers() });
    setAudit(res.ok ? (await res.json()).items : []);
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!user || !MODERATOR_ROLES.includes(user.role)) {
      router.replace("/");
      return;
    }
    void loadModeration();
    void loadReports();
    if (ADMIN_ROLES.includes(user.role)) {
      void loadContent();
      void loadUsers("");
      void loadEvents("ALL");
      void loadOrders();
      void loadAudit();
    }
  }, [authLoading, user, loadModeration, loadReports, loadContent, loadUsers, loadEvents, loadOrders, loadAudit]);

  async function decide(id: string, action: "approve" | "reject") {
    setBusy(id);
    try {
      await fetch(`${API_URL}/api/v1/admin/moderation/${id}/${action}`, { method: "PATCH", headers: headers() });
      await loadModeration();
    } finally {
      setBusy(null);
    }
  }

  async function setReviewStatus(id: string, status: "HIDDEN" | "REMOVED") {
    setBusy(id);
    try {
      await fetch(`${API_URL}/api/v1/admin/reviews/${id}`, { method: "PATCH", headers: headers(), body: JSON.stringify({ status }) });
      await loadModeration();
    } finally {
      setBusy(null);
    }
  }

  async function resolveReport(id: string, status: "RESOLVED" | "DISMISSED", hideTarget: boolean) {
    setBusy(id);
    try {
      const res = await fetch(`${API_URL}/api/v1/admin/reports/${id}/resolve`, { method: "PATCH", headers: headers(), body: JSON.stringify({ status, hideTarget }) });
      // The row used to vanish even when the PATCH failed, so a report looked handled while still open.
      if (res.ok) setReports((prev) => (prev ? prev.filter((r) => r.id !== id) : prev));
      else Alert.alert(t("common.somethingWentWrong"));
    } finally {
      setBusy(null);
    }
  }

  async function setContentStatus(kind: "categories" | "districts", id: string, status: "ACTIVE" | "ARCHIVED") {
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

  async function toggleEventTest(id: string, isTest: boolean) {
    setBusy(id);
    try {
      await fetch(`${API_URL}/api/v1/admin/events/${id}/test`, { method: "PATCH", headers: headers(), body: JSON.stringify({ isTest }) });
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
      <Stack.Screen options={{ title: t("nav.admin"), headerStyle: { backgroundColor: colors.background }, headerTintColor: colors.foreground }} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabsRow}>
        {tabs.map((key) => (
          <Pressable key={key} onPress={() => setTab(key)} style={[styles.tab, tab === key && styles.tabOn]}>
            <Text style={[styles.tabText, tab === key && { color: colors.white }]}>{t(`admin.nav.${key}`)}</Text>
          </Pressable>
        ))}
      </ScrollView>

      <ScrollView contentContainerStyle={styles.content}>
        {tab === "moderation" && (
          <>
            {cases === null && <ActivityIndicator color={colors.accentFrom} />}
            {cases?.length === 0 && <Text style={styles.muted}>{t("common.empty")}</Text>}
            {cases?.map((c) => (
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
            {reviews === null && <ActivityIndicator color={colors.accentFrom} />}
            {reviews?.length === 0 && <Text style={styles.muted}>{t("common.empty")}</Text>}
            {reviews?.map((r) => (
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
            {reports === null && <ActivityIndicator color={colors.accentFrom} />}
            {reports?.length === 0 && <Text style={styles.muted}>{t("admin.reports.empty")}</Text>}
            {reports?.map((r) => (
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

        {tab === "categories" && (
          <>
            {categories === null && <ActivityIndicator color={colors.accentFrom} />}
            {categories?.length === 0 && <Text style={styles.muted}>{t("adminContent.nothing")}</Text>}
            {categories?.map((c) => (
              <View key={c.id} style={styles.card}>
                <Text style={styles.title}>{c.nameUk}</Text>
                <Text style={styles.muted}>{submitterName(c.createdByUser, "—")}</Text>
                <View style={styles.actions}>
                  <Button title={t("adminContent.approve")} loading={busy === c.id} onPress={() => void setContentStatus("categories", c.id, "ACTIVE")} style={styles.small} />
                  <Button title={t("adminContent.reject")} variant="secondary" loading={busy === c.id} onPress={() => void setContentStatus("categories", c.id, "ARCHIVED")} style={styles.small} />
                </View>
              </View>
            ))}
          </>
        )}

        {tab === "districts" && (
          <>
            {districts === null && <ActivityIndicator color={colors.accentFrom} />}
            {districts?.length === 0 && <Text style={styles.muted}>{t("adminContent.nothing")}</Text>}
            {districts?.map((d) => (
              <View key={d.id} style={styles.card}>
                <Text style={styles.title}>
                  {d.nameUk}
                  {cityNames[d.cityId] ? ` · ${cityNames[d.cityId]}` : ""}
                </Text>
                <Text style={styles.muted}>{submitterName(d.createdByUser, "—")}</Text>
                <View style={styles.actions}>
                  <Button title={t("adminContent.approve")} loading={busy === d.id} onPress={() => void setContentStatus("districts", d.id, "ACTIVE")} style={styles.small} />
                  <Button title={t("adminContent.reject")} variant="secondary" loading={busy === d.id} onPress={() => void setContentStatus("districts", d.id, "ARCHIVED")} style={styles.small} />
                </View>
              </View>
            ))}
          </>
        )}

        {tab === "users" && (
          <>
            <TextField label={t("admin.users.search")} value={userSearch} onChangeText={setUserSearch} placeholder={t("admin.users.search")} />
            <Button title={t("admin.users.search")} variant="secondary" onPress={() => void loadUsers(userSearch)} style={styles.small} />
            {users === null && <ActivityIndicator color={colors.accentFrom} />}
            {users?.length === 0 && <Text style={styles.muted}>{t("admin.emptyList")}</Text>}
            {users?.map((u) => {
              const expanded = expandedUserId === u.id;
              const detail = userDetails[u.id];
              return (
                <Pressable key={u.id} style={styles.card} onPress={() => void toggleUserExpanded(u.id)}>
                  <Text style={styles.title}>{u.name ?? u.nickname ?? u.email}</Text>
                  <Text style={styles.muted}>
                    {u.email} · {u.role} · {u.status}
                  </Text>
                  <Text style={styles.muted}>
                    {t("admin.users.memberSince")} {formatShortDate(u.createdAt)}
                  </Text>
                  {expanded && (
                    <View style={{ gap: spacing.sm, marginTop: spacing.sm }}>
                      {!detail && <ActivityIndicator color={colors.accentFrom} />}
                      {detail && (
                        <View style={{ gap: spacing.xs }}>
                          <Text style={styles.muted}>
                            {t("admin.users.eventsCount")}: {detail.eventsCount} · {t("admin.users.registrationsCount")}: {detail.registrationsCount}
                          </Text>
                          <Text style={styles.muted}>
                            {t("admin.users.lastLogin")}: {detail.lastLoginAt ? formatShortDateTime(detail.lastLoginAt) : t("admin.users.never")}
                          </Text>
                        </View>
                      )}
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
                <View style={styles.cardHeadRow}>
                  <Text style={styles.title}>{e.title}</Text>
                  {e.isTest && (
                    <View style={styles.testBadge}>
                      <Text style={styles.testBadgeText}>{t("admin.events.testBadge")}</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.muted}>
                  {e.owner.name ?? e.owner.nickname ?? e.owner.email} · {e.status}
                </Text>
                {e.startsAt && <Text style={styles.muted}>{formatShortDateTime(e.startsAt)}</Text>}
                <View style={styles.actions}>
                  {e.status !== "CANCELLED" && (
                    <Button title={t("admin.events.cancel")} variant="danger" loading={busy === e.id} onPress={() => confirmCancelEvent(e.id)} style={styles.small} />
                  )}
                  <Button
                    title={e.isTest ? t("admin.events.unmarkTest") : t("admin.events.markTest")}
                    variant="secondary"
                    loading={busy === e.id}
                    onPress={() => void toggleEventTest(e.id, !e.isTest)}
                    style={styles.small}
                  />
                </View>
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
  cardHeadRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, flexWrap: "wrap" },
  testBadge: { backgroundColor: colors.danger, borderRadius: radius.full, paddingHorizontal: spacing.sm, paddingVertical: 2 },
  testBadgeText: { color: colors.white, fontSize: 10, fontWeight: "800" },
  body: { color: colors.foreground, fontSize: 13 },
  muted: { color: colors.muted, fontSize: 12 },
  label: { color: colors.foreground, fontSize: 12, fontWeight: "600" },
  error: { color: colors.danger, fontSize: 13 },
  small: { minHeight: 38, paddingHorizontal: spacing.lg },
  actions: { flexDirection: "row", gap: spacing.sm, flexWrap: "wrap" },
  pillRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  pill: { paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: radius.full, borderWidth: 1, borderColor: colors.border },
  pillOn: { backgroundColor: colors.accentFrom, borderColor: "transparent" },
  pillText: { color: colors.foreground, fontSize: 11, fontWeight: "600" },
});
