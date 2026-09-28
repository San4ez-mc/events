import { useCallback, useEffect, useRef, useState } from "react";
import { useLocalSearchParams, router } from "expo-router";
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, View } from "react-native";
import { API_URL, getAccessToken } from "../../src/lib/api-client";
import { useAuth } from "../../src/lib/auth-context";
import { useTranslations } from "../../src/lib/locale-context";
import { Button } from "../../src/components/ui/Button";
import { ScreenHeader } from "../../src/components/ui/ScreenHeader";
import type { InvitationCandidate } from "../../src/lib/event-types";
import { radius, spacing, type Palette, useThemedStyles } from "../../src/lib/theme";

/** §71 — invite people who attended this organizer's past events to a new one. Mirrors the web organizer invite page. */
export default function InvitePreviousParticipantsScreen() {
  const { colors, styles } = useThemedStyles(makeStyles);
  const { id } = useLocalSearchParams<{ id: string }>();
  const { isLoading: authLoading } = useAuth();
  const { t } = useTranslations();

  const [query, setQuery] = useState("");
  const [candidates, setCandidates] = useState<InvitationCandidate[] | null>(null);
  const [error, setError] = useState(false);
  const [invitedIds, setInvitedIds] = useState<Set<string>>(new Set());
  const [busyId, setBusyId] = useState<string | null>(null);
  // Every keystroke fires a search; without this, a slow response for an older query could land after a newer one and overwrite it.
  const latestQuery = useRef("");

  const search = useCallback(
    async (q: string) => {
      const token = getAccessToken();
      if (!token) return;
      latestQuery.current = q;
      const params = q ? `?q=${encodeURIComponent(q)}` : "";
      const res = await fetch(`${API_URL}/api/v1/events/${id}/invitations/candidates${params}`, { headers: { Authorization: `Bearer ${token}` } });
      if (latestQuery.current !== q) return;
      if (!res.ok) {
        setError(true);
        return;
      }
      setError(false);
      setCandidates((await res.json()) as InvitationCandidate[]);
    },
    [id],
  );

  useEffect(() => {
    if (authLoading || !id) return;
    if (!getAccessToken()) {
      router.replace("/login");
      return;
    }
    void search("");
  }, [authLoading, id, search]);

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
            <Text style={styles.label}>{t("organizerInvite.search")}</Text>
            <TextInput
              value={query}
              onChangeText={(v) => {
                setQuery(v);
                void search(v);
              }}
              placeholder={t("organizerInvite.searchPlaceholder")}
              placeholderTextColor={colors.muted}
              style={styles.input}
              autoCapitalize="none"
            />
            {error && <Text style={styles.error}>{t("common.somethingWentWrong")}</Text>}
            {!error && candidates === null && <ActivityIndicator color={colors.accentFrom} />}
            {!error && candidates !== null && candidates.length === 0 && <Text style={styles.hint}>{t("organizerInvite.empty")}</Text>}
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.row}>
            <View style={styles.rowText}>
              <Text style={styles.name} numberOfLines={1}>
                {item.name ?? item.nickname ?? item.email}
              </Text>
              <Text style={styles.email} numberOfLines={1}>
                {item.email}
              </Text>
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
  label: { color: colors.foreground, fontSize: 13, fontWeight: "600" },
  input: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, color: colors.foreground, paddingHorizontal: spacing.md, paddingVertical: 10, fontSize: 14 },
  hint: { color: colors.muted, fontSize: 13 },
  error: { color: colors.danger, fontSize: 13 },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md },
  rowText: { flex: 1, gap: 2 },
  name: { color: colors.foreground, fontSize: 15, fontWeight: "600" },
  email: { color: colors.muted, fontSize: 12 },
});
