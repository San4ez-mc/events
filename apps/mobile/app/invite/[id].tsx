import { useCallback, useEffect, useRef, useState } from "react";
import { useLocalSearchParams, router } from "expo-router";
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { API_URL, getAccessToken } from "../../src/lib/api-client";
import { useAuth } from "../../src/lib/auth-context";
import { useTranslations } from "../../src/lib/locale-context";
import { Button } from "../../src/components/ui/Button";
import { ScreenHeader } from "../../src/components/ui/ScreenHeader";
import type { FriendInvitationCandidate, InvitationCandidate } from "../../src/lib/event-types";
import { radius, spacing, type Palette, useThemedStyles } from "../../src/lib/theme";

type Source = "past" | "friends";
type Candidate = InvitationCandidate | FriendInvitationCandidate;

/** §71 — invite people to an event, either from past participants of the organizer's events or from their friends list. Mirrors the web organizer invite page. */
export default function InvitePreviousParticipantsScreen() {
  const { colors, styles } = useThemedStyles(makeStyles);
  const { id } = useLocalSearchParams<{ id: string }>();
  const { isLoading: authLoading } = useAuth();
  const { t } = useTranslations();

  const [source, setSource] = useState<Source>("past");
  const [query, setQuery] = useState("");
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [error, setError] = useState(false);
  const [invitedIds, setInvitedIds] = useState<Set<string>>(new Set());
  const [busyId, setBusyId] = useState<string | null>(null);
  // Every keystroke fires a search; without this, a slow response for an older query could land after a newer one and overwrite it.
  const latestQuery = useRef("");

  const search = useCallback(
    async (src: Source, q: string) => {
      const token = getAccessToken();
      if (!token) return;
      const key = `${src}:${q}`;
      latestQuery.current = key;
      setCandidates(null);
      const path = src === "friends" ? "friend-candidates" : "candidates";
      const params = q ? `?q=${encodeURIComponent(q)}` : "";
      const res = await fetch(`${API_URL}/api/v1/events/${id}/invitations/${path}${params}`, { headers: { Authorization: `Bearer ${token}` } });
      if (latestQuery.current !== key) return;
      if (!res.ok) {
        setError(true);
        return;
      }
      setError(false);
      setCandidates((await res.json()) as Candidate[]);
    },
    [id],
  );

  useEffect(() => {
    if (authLoading || !id) return;
    if (!getAccessToken()) {
      router.replace("/login");
      return;
    }
    void search(source, query);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- a source switch should reset to the unfiltered list, not re-fire for the stale query text
  }, [authLoading, id, source]);

  async function invite(inviteeUserId: string) {
    const token = getAccessToken();
    if (!token) return;
    setBusyId(inviteeUserId);
    try {
      const res = await fetch(`${API_URL}/api/v1/events/${id}/invitations`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ inviteeUserId }),
      });
      if (res.ok) setInvitedIds((prev) => new Set(prev).add(inviteeUserId));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : "height"}>
      <FlatList
        data={candidates ?? []}
        keyExtractor={(c) => c.id}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <View style={styles.header}>
            <ScreenHeader title={t("organizerInvite.title")} icon="person-add" />
            <View style={styles.tabs}>
              <Pressable style={[styles.tab, source === "past" && styles.tabActive]} onPress={() => { setSource("past"); setQuery(""); }}>
                <Text style={[styles.tabText, source === "past" && styles.tabTextActive]}>{t("organizerInvite.tabPastParticipants")}</Text>
              </Pressable>
              <Pressable style={[styles.tab, source === "friends" && styles.tabActive]} onPress={() => { setSource("friends"); setQuery(""); }}>
                <Text style={[styles.tabText, source === "friends" && styles.tabTextActive]}>{t("organizerInvite.tabFriends")}</Text>
              </Pressable>
            </View>
            <Text style={styles.label}>{t("organizerInvite.search")}</Text>
            <TextInput
              value={query}
              onChangeText={(v) => {
                setQuery(v);
                void search(source, v);
              }}
              placeholder={source === "friends" ? t("organizerInvite.searchPlaceholderFriends") : t("organizerInvite.searchPlaceholder")}
              placeholderTextColor={colors.muted}
              style={styles.input}
              autoCapitalize="none"
            />
            {error && <Text style={styles.error}>{t("common.somethingWentWrong")}</Text>}
            {!error && candidates === null && <ActivityIndicator color={colors.accentFrom} />}
            {!error && candidates !== null && candidates.length === 0 && (
              <Text style={styles.hint}>{source === "friends" ? t("organizerInvite.emptyFriends") : t("organizerInvite.empty")}</Text>
            )}
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.row}>
            <View style={styles.rowText}>
              <Text style={styles.name} numberOfLines={1}>
                {item.name ?? item.nickname ?? ("email" in item ? item.email : "")}
              </Text>
              {"email" in item && (
                <Text style={styles.email} numberOfLines={1}>
                  {item.email}
                </Text>
              )}
            </View>
            <Button
              title={invitedIds.has(item.id) ? t("organizerInvite.invited") : t("organizerInvite.invite")}
              variant="secondary"
              disabled={invitedIds.has(item.id)}
              loading={busyId === item.id}
              onPress={() => void invite(item.id)}
            />
          </View>
        )}
      />
    </KeyboardAvoidingView>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.sm },
  header: { gap: spacing.sm, marginBottom: spacing.sm },
  tabs: { flexDirection: "row", gap: spacing.sm },
  tab: { flex: 1, paddingVertical: spacing.sm, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, alignItems: "center" },
  tabActive: { backgroundColor: colors.accentFrom, borderColor: colors.accentFrom },
  tabText: { color: colors.foreground, fontSize: 13, fontWeight: "600" },
  tabTextActive: { color: colors.white },
  label: { color: colors.foreground, fontSize: 13, fontWeight: "600" },
  input: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, color: colors.foreground, paddingHorizontal: spacing.md, paddingVertical: 10, fontSize: 14 },
  hint: { color: colors.muted, fontSize: 13 },
  error: { color: colors.danger, fontSize: 13 },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md },
  rowText: { flex: 1, gap: 2 },
  name: { color: colors.foreground, fontSize: 15, fontWeight: "600" },
  email: { color: colors.muted, fontSize: 12 },
});
