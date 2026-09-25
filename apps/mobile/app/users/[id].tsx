import { useCallback, useEffect, useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { ActivityIndicator, Image, Pressable, ScrollView, Share, StyleSheet, Text, View } from "react-native";
import { API_URL, getAccessToken } from "../../src/lib/api-client";
import { useAuth } from "../../src/lib/auth-context";
import { useTranslations } from "../../src/lib/locale-context";
import { Button } from "../../src/components/ui/Button";
import { OrganizerFollow } from "../../src/components/social/OrganizerFollow";
import type { EventCard } from "../../src/lib/event-types";
import { colors, radius, spacing } from "../../src/lib/theme";

type Relationship = "SELF" | "NONE" | "PENDING_SENT" | "PENDING_RECEIVED" | "FRIENDS";

interface PublicProfile {
  id: string;
  name: string | null;
  nickname: string | null;
  avatarUrl: string | null;
  bio: string | null;
  memberSince: string;
  friendCount: number;
  eventsCreatedCount: number;
  upcomingEvents: EventCard[];
  pastEvents: EventCard[];
  ratingAverage: number | null;
  reviewsCount: number;
  relationshipStatus: Relationship;
}

/** UX §22 — public profile of an organizer / user, with the friend action. */
export default function PublicProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user, isLoading: authLoading } = useAuth();
  const { t, locale } = useTranslations();
  const [profile, setProfile] = useState<PublicProfile | null | undefined>(undefined);
  const [acting, setActing] = useState(false);

  const load = useCallback(async () => {
    const token = getAccessToken();
    const res = await fetch(`${API_URL}/api/v1/users/${id}/profile`, { headers: token ? { Authorization: `Bearer ${token}` } : undefined });
    setProfile(res.ok ? await res.json() : null);
  }, [id]);

  useEffect(() => {
    if (!authLoading) void load();
  }, [authLoading, load]);

  async function addFriend() {
    const token = getAccessToken();
    if (!token) {
      router.push("/login");
      return;
    }
    setActing(true);
    try {
      const res = await fetch(`${API_URL}/api/v1/friends/requests`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ addresseeId: id }),
      });
      if (res.ok) setProfile((p) => (p ? { ...p, relationshipStatus: "PENDING_SENT" } : p));
    } finally {
      setActing(false);
    }
  }

  if (profile === undefined) return <ActivityIndicator style={{ flex: 1 }} color={colors.accentFrom} />;
  if (profile === null) return <Text style={styles.center}>{t("errors.NOT_FOUND")}</Text>;

  const name = profile.name ?? profile.nickname ?? "—";
  const date = (iso: string) => new Date(iso).toLocaleDateString(locale === "uk" ? "uk-UA" : "en-US");

  const eventRow = (e: EventCard) => (
    <Pressable key={e.id} style={styles.eventRow} onPress={() => router.push(`/event/${e.slug}`)}>
      {e.media[0] ? <Image source={{ uri: e.media[0].thumbnailUrl }} style={styles.thumb} /> : <View style={[styles.thumb, { backgroundColor: colors.surface }]} />}
      <View style={{ flex: 1 }}>
        <Text style={styles.eventTitle} numberOfLines={2}>
          {e.title}
        </Text>
        {e.startsAt && <Text style={styles.muted}>{new Date(e.startsAt).toLocaleString(locale === "uk" ? "uk-UA" : "en-US")}</Text>}
      </View>
    </Pressable>
  );

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.head}>
        {profile.avatarUrl ? (
          <Image source={{ uri: profile.avatarUrl }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.avatarFallback]}>
            <Text style={styles.avatarText}>{name.slice(0, 1).toUpperCase()}</Text>
          </View>
        )}
        <View style={{ flex: 1 }}>
          <Text style={styles.name}>{name}</Text>
          <Text style={styles.muted}>
            {t("profile.memberSince")} {date(profile.memberSince)}
          </Text>
        </View>
      </View>

      {profile.bio && <Text style={styles.bio}>{profile.bio}</Text>}

      <View style={styles.stats}>
        <Text style={styles.muted}>
          <Text style={styles.strong}>{profile.friendCount}</Text> {t("profile.friends")}
        </Text>
        <Text style={styles.muted}>
          <Text style={styles.strong}>{profile.eventsCreatedCount}</Text> {t("profile.eventsCreated")}
        </Text>
        <Text style={styles.muted}>{profile.ratingAverage != null ? `⭐ ${profile.ratingAverage.toFixed(1)} (${profile.reviewsCount})` : t("profile.noRating")}</Text>
      </View>

      <View style={styles.actions}>
        <Button
          title={t("profile.share")}
          variant="secondary"
          onPress={() => void Share.share({ message: `${name}\n${API_URL}/users/${profile.id}`, url: `${API_URL}/users/${profile.id}` }).catch(() => {})}
        />
        {user && profile.relationshipStatus === "NONE" && <Button title={t("profile.addFriend")} onPress={() => void addFriend()} loading={acting} />}
        {profile.relationshipStatus === "PENDING_SENT" && <Button title={t("profile.pendingSent")} variant="secondary" disabled onPress={() => {}} />}
        {profile.relationshipStatus === "PENDING_RECEIVED" && <Button title={t("profile.pendingReceived")} variant="secondary" onPress={() => router.push("/friends")} />}
        {profile.relationshipStatus === "FRIENDS" && <Button title={`✓ ${t("profile.friends")}`} variant="secondary" onPress={() => router.push("/friends")} />}
      </View>

      {user && profile.relationshipStatus !== "SELF" && profile.eventsCreatedCount > 0 && <OrganizerFollow organizerId={profile.id} />}

      {profile.upcomingEvents.length > 0 && (
        <>
          <Text style={styles.section}>{t("profile.upcomingEvents")}</Text>
          {profile.upcomingEvents.map(eventRow)}
        </>
      )}
      {profile.pastEvents.length > 0 && (
        <>
          <Text style={styles.section}>{t("profile.pastEvents")}</Text>
          {profile.pastEvents.map(eventRow)}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl },
  center: { color: colors.muted, textAlign: "center", marginTop: spacing.xxl },
  head: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  avatar: { width: 76, height: 76, borderRadius: 38 },
  avatarFallback: { backgroundColor: colors.accentFrom, alignItems: "center", justifyContent: "center" },
  avatarText: { color: colors.white, fontSize: 30, fontWeight: "800" },
  name: { color: colors.foreground, fontSize: 22, fontWeight: "800" },
  muted: { color: colors.muted, fontSize: 13 },
  strong: { color: colors.foreground, fontWeight: "700" },
  bio: { color: colors.foreground, fontSize: 14, lineHeight: 20 },
  stats: { flexDirection: "row", flexWrap: "wrap", gap: spacing.lg },
  actions: { gap: spacing.sm },
  section: { color: colors.foreground, fontSize: 15, fontWeight: "700", marginTop: spacing.md },
  eventRow: { flexDirection: "row", gap: spacing.md, backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.sm },
  thumb: { width: 64, height: 64, borderRadius: radius.md },
  eventTitle: { color: colors.foreground, fontSize: 14, fontWeight: "600" },
});
