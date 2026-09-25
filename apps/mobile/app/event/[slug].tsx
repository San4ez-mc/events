import { useCallback, useEffect, useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { ActivityIndicator, Alert, Image, Linking, Pressable, ScrollView, Share, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { API_URL, getAccessToken } from "../../src/lib/api-client";
import { ApiRequestError, useAuth } from "../../src/lib/auth-context";
import { useTranslations } from "../../src/lib/locale-context";
import { Button } from "../../src/components/ui/Button";
import { RegistrationFieldInput } from "../../src/components/registration/RegistrationFieldInput";
import { EventGallery } from "../../src/components/event/EventGallery";
import { EventChat } from "../../src/components/event/EventChat";
import { sourceFromParam, track } from "../../src/lib/analytics";
import type { EventDetail, Registration } from "../../src/lib/event-types";
import { colors, radius, spacing } from "../../src/lib/theme";

export default function EventDetailScreen() {
  const { slug, src } = useLocalSearchParams<{ slug: string; src?: string }>();
  const { user, isLoading: authLoading } = useAuth();
  const { t, locale } = useTranslations();

  const [event, setEvent] = useState<EventDetail | null | undefined>(undefined);
  const [registration, setRegistration] = useState<Registration | null | undefined>(undefined);
  const [showForm, setShowForm] = useState(false);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [joinWaitlist, setJoinWaitlist] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadEvent = useCallback(async () => {
    const token = getAccessToken();
    const res = await fetch(`${API_URL}/api/v1/events/slug/${slug}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });
    const body = res.ok ? await res.json() : null;
    setEvent(body);
    if (body) setSaved(Boolean(body.viewerSaved));
  }, [slug]);

  useEffect(() => {
    void loadEvent();
  }, [loadEvent]);

  // §45 — one VIEW per opened event, with where the user came from.
  const eventId = event?.id;
  const eventStatus = event?.status;
  useEffect(() => {
    if (eventId && eventStatus === "PUBLISHED") track(eventId, "VIEW", sourceFromParam(src));
  }, [eventId, eventStatus, src]);

  useEffect(() => {
    if (authLoading || !event) return;
    if (!user) {
      setRegistration(null);
      return;
    }
    const token = getAccessToken();
    if (!token) return;
    (async () => {
      const res = await fetch(`${API_URL}/api/v1/events/${event.id}/registrations/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setRegistration((await res.json()).registration);
    })();
  }, [authLoading, user, event]);

  async function toggleSave() {
    const token = getAccessToken();
    if (!token || !event) {
      router.push("/login");
      return;
    }
    const next = !saved;
    setSaved(next);
    const res = await fetch(`${API_URL}/api/v1/discovery/${event.id}/save`, {
      method: next ? "POST" : "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    }).catch(() => null);
    if (!res?.ok) setSaved(!next);
  }

  function reportEvent() {
    const token = getAccessToken();
    if (!token || !event) {
      router.push("/login");
      return;
    }
    const send = async (reason: string) => {
      const res = await fetch(`${API_URL}/api/v1/reports`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ targetType: "EVENT", targetId: event.id, reason }),
      }).catch(() => null);
      Alert.alert(res?.ok ? t("events.actions.reportSent") : t("common.somethingWentWrong"));
    };
    const reasons = ["spam", "fraud", "inappropriate", "wrongInfo", "other"] as const;
    Alert.alert(t("events.actions.report"), undefined, [
      ...reasons.map((r) => ({ text: t(`events.actions.reasons.${r}`), onPress: () => void send(t(`events.actions.reasons.${r}`)) })),
      { text: t("common.cancel"), style: "cancel" as const },
    ]);
  }

  async function submit() {
    const token = getAccessToken();
    if (!token || !event) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/api/v1/events/${event.id}/registrations`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          answers: event.registrationFields.map((f) => ({ fieldId: f.id, value: answers[f.id] })),
          joinWaitlist,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new ApiRequestError(body);
      setRegistration(body);
      setShowForm(false);
      void loadEvent(); // the exact address is only sent to registered users (§10)
    } catch (err) {
      if (err instanceof ApiRequestError && err.code === "EVENT_CAPACITY_REACHED") setJoinWaitlist(true);
      setError(err instanceof ApiRequestError ? t(`errors.${err.code}`) : t("common.somethingWentWrong"));
    } finally {
      setSubmitting(false);
    }
  }

  async function cancelRegistration() {
    const token = getAccessToken();
    if (!token || !registration) return;
    setSubmitting(true);
    try {
      const res = await fetch(`${API_URL}/api/v1/registrations/${registration.id}/cancel`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setRegistration(await res.json());
      void loadEvent();
    } finally {
      setSubmitting(false);
    }
  }

  async function markPaid() {
    const token = getAccessToken();
    if (!token || !registration) return;
    setSubmitting(true);
    try {
      const res = await fetch(`${API_URL}/api/v1/registrations/${registration.id}/mark-paid`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setRegistration(await res.json());
    } finally {
      setSubmitting(false);
    }
  }

  if (event === undefined) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accentFrom} />
      </View>
    );
  }
  if (event === null) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>{t("errors.EVENT_NOT_FOUND")}</Text>
      </View>
    );
  }

  const social = event.social;
  const organizer = event.organizer;
  const spotsLeft = event.capacity != null && social ? Math.max(0, event.capacity - social.registeredCount) : null;
  const mapsUrl =
    event.latitude && event.longitude
      ? `https://www.google.com/maps/dir/?api=1&destination=${event.latitude},${event.longitude}`
      : event.addressText
        ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(event.addressText)}`
        : null;
  const applyLabel = event.approvalMode === "ORGANIZER_APPROVAL" ? t("registration.apply") : t("registration.register");

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.galleryBleed}>
        <EventGallery media={event.media} />
      </View>

      <View style={styles.titleRow}>
        <Text style={[styles.title, { flex: 1 }]}>{event.title}</Text>
        <Pressable style={styles.shareButton} onPress={() => void toggleSave()} accessibilityLabel={saved ? t("events.actions.saved") : t("events.actions.save")}>
          <Ionicons name={saved ? "bookmark" : "bookmark-outline"} size={22} color={saved ? colors.accentFrom : colors.foreground} />
        </Pressable>
        <Pressable
          style={styles.shareButton}
          onPress={() => { track(event.id, "SHARE"); void Share.share({ message: `${event.title}\n${API_URL}/events/${event.slug}`, url: `${API_URL}/events/${event.slug}` }).catch(() => {}); }}
          accessibilityLabel={t("discover.share")}
        >
          <Ionicons name="share-social-outline" size={22} color={colors.foreground} />
        </Pressable>
        <Pressable style={styles.shareButton} onPress={reportEvent} accessibilityLabel={t("events.actions.report")}>
          <Ionicons name="flag-outline" size={20} color={colors.foreground} />
        </Pressable>
      </View>

      <View style={styles.metaRow}>
        {event.startsAt && <Text style={styles.meta}>{new Date(event.startsAt).toLocaleString(locale === "uk" ? "uk-UA" : "en-US")}</Text>}
        {event.format === "OFFLINE" && event.city && <Text style={styles.meta}>{event.city.nameUk}</Text>}
        {event.format === "ONLINE" && <Text style={styles.meta}>{t("events.wizard.formatOnline")}</Text>}
        <Text style={styles.meta}>{event.priceType === "FREE" ? t("common.free") : `${event.price ?? "?"} ${event.currency}`}</Text>
      </View>

      {social && (
        <View style={styles.socialBar}>
          <View style={styles.socialRow}>
            <Ionicons name="people" size={18} color={colors.foreground} />
            <Text style={styles.socialCount}>
              {event.capacity != null ? `${social.registeredCount} / ${event.capacity}` : social.registeredCount}{" "}
              <Text style={styles.socialMuted}>{t("events.page.participantsCount")}</Text>
            </Text>
            {spotsLeft !== null && (
              <Text style={[styles.socialMuted, spotsLeft === 0 && { color: colors.danger, fontWeight: "700" }]}>
                {spotsLeft === 0 ? t("events.page.soldOut") : `${spotsLeft} ${t("events.page.spotsLeft")}`}
              </Text>
            )}
          </View>
          {event.friendsGoing.count > 0 && (
            <Text style={styles.socialMuted}>
              {event.friendsGoing.count} {event.friendsGoing.count === 1 ? t("profile.friendsGoingOne") : t("profile.friendsGoingMany")}
            </Text>
          )}
        </View>
      )}

      {event.description && <Text style={styles.description}>{event.description}</Text>}

      {organizer && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t("events.page.organizer")}</Text>
          <Pressable style={styles.organizerCard} onPress={() => router.push(`/users/${organizer.id}`)}>
            {organizer.avatarUrl ? (
              <Image source={{ uri: organizer.avatarUrl }} style={styles.orgAvatar} />
            ) : (
              <View style={[styles.orgAvatar, styles.orgAvatarFallback]}>
                <Text style={styles.orgInitial}>{(organizer.name ?? organizer.nickname ?? "?").slice(0, 1).toUpperCase()}</Text>
              </View>
            )}
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={styles.orgName} numberOfLines={1}>
                {organizer.name ?? organizer.nickname}
              </Text>
              <View style={styles.socialRow}>
                {organizer.rating.average !== null && (
                  <>
                    <Ionicons name="star" size={13} color="#f59e0b" />
                    <Text style={styles.orgRating}>{organizer.rating.average.toFixed(1)}</Text>
                  </>
                )}
                <Text style={styles.socialMuted}>
                  {organizer.eventsCount} {t("events.page.eventsHosted")}
                </Text>
              </View>
            </View>
          </Pressable>
        </View>
      )}

      <View style={styles.locationCard}>
        {event.addressLocked || (!event.addressText && !event.onlineUrl) ? (
          <View style={styles.socialRow}>
            <Ionicons name="lock-closed-outline" size={20} color={colors.muted} />
            <Text style={[styles.socialMuted, { flex: 1 }]}>{t("events.location.lockedHint")}</Text>
          </View>
        ) : (
          <View style={{ gap: spacing.sm }}>
            {event.addressText && (
              <View style={styles.socialRow}>
                <Ionicons name="location" size={18} color={colors.accentFrom} />
                <Text style={[styles.locationText, { flex: 1 }]}>{event.addressText}</Text>
              </View>
            )}
            {event.onlineUrl && (
              <Pressable style={styles.socialRow} onPress={() => void Linking.openURL(event.onlineUrl!)}>
                <Ionicons name="videocam" size={18} color={colors.accentFrom} />
                <Text style={[styles.locationText, { textDecorationLine: "underline" }]}>{t("events.location.joinOnline")}</Text>
              </Pressable>
            )}
            {mapsUrl && (
              <Pressable style={styles.routeButton} onPress={() => void Linking.openURL(mapsUrl)}>
                <Ionicons name="navigate" size={16} color={colors.white} />
                <Text style={styles.routeText}>{t("events.location.route")}</Text>
              </Pressable>
            )}
          </View>
        )}
      </View>

      {event.rules && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{locale === "uk" ? "Правила" : "Rules"}</Text>
          <Text style={styles.meta}>{event.rules}</Text>
        </View>
      )}

      {event.participants && event.participants.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            {t("events.page.participants")} · {social?.registeredCount ?? event.participants.length}
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.md }}>
            {event.participants.map((p) => (
              <View key={p.id} style={styles.participant}>
                {p.avatarUrl ? (
                  <Image source={{ uri: p.avatarUrl }} style={styles.pAvatar} />
                ) : (
                  <View style={[styles.pAvatar, styles.orgAvatarFallback]}>
                    <Text style={styles.orgInitial}>{(p.name ?? "?").slice(0, 1).toUpperCase()}</Text>
                  </View>
                )}
                <Text style={styles.pName} numberOfLines={1}>
                  {p.name}
                </Text>
              </View>
            ))}
          </ScrollView>
        </View>
      )}

      <EventChat eventId={event.id} refreshKey={registration?.status ?? "none"} />

      <View style={styles.registrationBox}>
        {error && <Text style={styles.error}>{error}</Text>}
        {renderRegistration()}
      </View>

      {event.priceType === "PAID" && <Text style={styles.disclaimer}>{t("events.page.paidDisclaimer")}</Text>}
    </ScrollView>
  );

  function renderRegistration() {
    if (!event) return null;
    if (event.status === "CANCELLED") return <Text style={styles.error}>{t("registration.eventCancelled")}</Text>;
    if (event.status !== "PUBLISHED") return <Text style={styles.muted}>{t("registration.registrationClosed")}</Text>;

    if (authLoading || registration === undefined) return <ActivityIndicator color={colors.accentFrom} />;
    if (!user) return <Button title={t("auth.login.title")} onPress={() => router.push("/login")} />;

    if (!registration || registration.status === "CANCELLED" || registration.status === "REJECTED") {
      if (showForm && event.registrationFields.length > 0) {
        return (
          <View style={styles.form}>
            {event.registrationFields.map((field) => (
              <RegistrationFieldInput
                key={field.id}
                field={field}
                value={answers[field.id]}
                onChange={(value) => setAnswers((a) => ({ ...a, [field.id]: value }))}
              />
            ))}
            <Button title={joinWaitlist ? t("registration.joinWaitlist") : t("registration.submitApplication")} onPress={() => void submit()} loading={submitting} />
          </View>
        );
      }
      return (
        <Button
          title={joinWaitlist ? t("registration.joinWaitlist") : applyLabel}
          onPress={() => (event.registrationFields.length > 0 ? setShowForm(true) : void submit())}
          loading={submitting}
        />
      );
    }

    if (registration.status === "PENDING") return <Text style={styles.muted}>{t("registration.pending")}</Text>;
    if (registration.status === "WAITLISTED") return <Text style={styles.muted}>{t("registration.waitlisted")}</Text>;
    if (registration.status === "PAYMENT_PENDING") return <Text style={styles.muted}>{t("registration.paymentPendingConfirmation")}</Text>;

    if (registration.status === "REGISTERED" && event.priceType === "PAID") {
      return (
        <View style={styles.form}>
          <Text style={styles.muted}>{t("registration.registered")}</Text>
          <Button title={t("registration.markPaid")} onPress={() => void markPaid()} loading={submitting} />
        </View>
      );
    }

    return (
      <View style={styles.form}>
        <Text style={styles.muted}>{registration.status === "CONFIRMED" ? t("registration.confirmed") : t("registration.registered")}</Text>
        <Button title={t("registration.cancelRegistration")} variant="secondary" onPress={() => void cancelRegistration()} loading={submitting} />
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl * 2, gap: spacing.md },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background },
  galleryBleed: { marginHorizontal: -spacing.lg, marginTop: -spacing.lg },
  titleRow: { flexDirection: "row", alignItems: "flex-start", gap: spacing.md },
  shareButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" },
  socialBar: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, gap: 6 },
  socialRow: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  socialCount: { color: colors.foreground, fontSize: 14, fontWeight: "700" },
  socialMuted: { color: colors.muted, fontSize: 13 },
  organizerCard: { flexDirection: "row", alignItems: "center", gap: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.md },
  orgAvatar: { width: 46, height: 46, borderRadius: 23 },
  orgAvatarFallback: { backgroundColor: colors.accentFrom, alignItems: "center", justifyContent: "center" },
  orgInitial: { color: colors.white, fontWeight: "800", fontSize: 16 },
  orgName: { color: colors.foreground, fontSize: 15, fontWeight: "700" },
  orgRating: { color: "#f59e0b", fontSize: 13, fontWeight: "700" },
  locationCard: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.md },
  locationText: { color: colors.foreground, fontSize: 14, fontWeight: "600" },
  routeButton: { flexDirection: "row", alignItems: "center", gap: 8, alignSelf: "flex-start", backgroundColor: colors.accentFrom, borderRadius: radius.full, paddingHorizontal: 16, paddingVertical: 10 },
  routeText: { color: colors.white, fontWeight: "700", fontSize: 14 },
  participant: { width: 60, alignItems: "center", gap: 4 },
  pAvatar: { width: 48, height: 48, borderRadius: 24 },
  pName: { color: colors.muted, fontSize: 11, maxWidth: 60 },
  disclaimer: { color: colors.muted, fontSize: 11, lineHeight: 16, backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md },
  title: { color: colors.foreground, fontSize: 24, fontWeight: "700" },
  metaRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  meta: { color: colors.muted, fontSize: 13 },
  description: { color: colors.foreground, fontSize: 14, lineHeight: 20 },
  section: { gap: spacing.xs },
  sectionTitle: { color: colors.foreground, fontSize: 14, fontWeight: "600" },
  registrationBox: { marginTop: spacing.md, gap: spacing.sm },
  form: { gap: spacing.sm },
  error: { color: colors.danger, fontSize: 13, textAlign: "center" },
  muted: { color: colors.muted, fontSize: 14, textAlign: "center" },
});
