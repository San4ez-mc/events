import { useCallback, useEffect, useState } from "react";
import { router } from "expo-router";
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { API_URL, getAccessToken } from "../src/lib/api-client";
import { useAuth } from "../src/lib/auth-context";
import { useTranslations } from "../src/lib/locale-context";
import { Button } from "../src/components/ui/Button";
import { colors, radius, spacing } from "../src/lib/theme";

interface PublicUser {
  id: string;
  name: string | null;
  nickname: string | null;
  avatarUrl: string | null;
}
interface FriendRequest {
  id: string;
  requester?: PublicUser;
  addressee?: PublicUser;
}

/** UX §23 — friends, incoming requests (accept/reject) and outgoing requests (cancel). */
export default function FriendsScreen() {
  const { user, isLoading } = useAuth();
  const { t } = useTranslations();
  const [friends, setFriends] = useState<PublicUser[] | null>(null);
  const [incoming, setIncoming] = useState<FriendRequest[]>([]);
  const [outgoing, setOutgoing] = useState<FriendRequest[]>([]);

  const load = useCallback(async () => {
    const token = getAccessToken();
    if (!token) return;
    const headers = { Authorization: `Bearer ${token}` };
    const [f, i, o] = await Promise.all([
      fetch(`${API_URL}/api/v1/friends`, { headers }),
      fetch(`${API_URL}/api/v1/friends/requests/incoming`, { headers }),
      fetch(`${API_URL}/api/v1/friends/requests/outgoing`, { headers }),
    ]);
    setFriends(f.ok ? await f.json() : []);
    if (i.ok) setIncoming(await i.json());
    if (o.ok) setOutgoing(await o.json());
  }, []);

  useEffect(() => {
    if (isLoading) return;
    if (!user) {
      router.replace("/login");
      return;
    }
    void load();
  }, [isLoading, user, load]);

  async function act(id: string, action: "accept" | "reject" | "cancel") {
    const token = getAccessToken();
    if (!token) return;
    await fetch(`${API_URL}/api/v1/friends/requests/${id}/${action}`, { method: "PATCH", headers: { Authorization: `Bearer ${token}` } });
    await load();
  }

  const person = (u: PublicUser | undefined, right?: React.ReactNode) =>
    u ? (
      <Pressable key={u.id} style={styles.row} onPress={() => router.push(`/users/${u.id}`)}>
        {u.avatarUrl ? (
          <Image source={{ uri: u.avatarUrl }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.avatarFallback]}>
            <Text style={styles.avatarText}>{(u.name ?? u.nickname ?? "?").slice(0, 1).toUpperCase()}</Text>
          </View>
        )}
        <Text style={styles.name} numberOfLines={1}>
          {u.name ?? u.nickname}
        </Text>
        {right}
      </Pressable>
    ) : null;

  if (friends === null) return <ActivityIndicator style={{ flex: 1 }} color={colors.accentFrom} />;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.section}>{t("friends.incoming")}</Text>
      {incoming.length === 0 && <Text style={styles.muted}>{t("friends.noIncoming")}</Text>}
      {incoming.map((r) =>
        person(
          r.requester,
          <View style={styles.actions}>
            <Button title={t("profile.acceptRequest")} onPress={() => void act(r.id, "accept")} style={styles.small} />
            <Button title={t("profile.rejectRequest")} variant="secondary" onPress={() => void act(r.id, "reject")} style={styles.small} />
          </View>,
        ),
      )}

      <Text style={styles.section}>{t("friends.title")}</Text>
      {friends.length === 0 && <Text style={styles.muted}>{t("friends.empty")}</Text>}
      {friends.map((u) => person(u))}

      {outgoing.length > 0 && (
        <>
          <Text style={styles.section}>{t("friends.outgoing")}</Text>
          {outgoing.map((r) => person(r.addressee, <Button title={t("profile.cancelRequest")} variant="secondary" onPress={() => void act(r.id, "cancel")} style={styles.small} />))}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.sm, paddingBottom: spacing.xxl },
  section: { color: colors.foreground, fontSize: 15, fontWeight: "700", marginTop: spacing.md },
  muted: { color: colors.muted, fontSize: 13 },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.sm },
  avatar: { width: 44, height: 44, borderRadius: 22 },
  avatarFallback: { backgroundColor: colors.accentFrom, alignItems: "center", justifyContent: "center" },
  avatarText: { color: colors.white, fontWeight: "800" },
  name: { flex: 1, color: colors.foreground, fontSize: 15, fontWeight: "600" },
  actions: { flexDirection: "row", gap: spacing.xs },
  small: { minHeight: 36, paddingHorizontal: spacing.md },
});
