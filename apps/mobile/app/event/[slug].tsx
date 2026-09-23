import { useCallback, useEffect, useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { ActivityIndicator, Image, ScrollView, StyleSheet, Text, View } from "react-native";
import { API_URL, getAccessToken } from "../../src/lib/api-client";
import { ApiRequestError, useAuth } from "../../src/lib/auth-context";
import { useTranslations } from "../../src/lib/locale-context";
import { Button } from "../../src/components/ui/Button";
import { RegistrationFieldInput } from "../../src/components/registration/RegistrationFieldInput";
import type { EventDetail, Registration } from "../../src/lib/event-types";
import { colors, radius, spacing } from "../../src/lib/theme";

export default function EventDetailScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { user, isLoading: authLoading } = useAuth();
  const { t, locale } = useTranslations();

  const [event, setEvent] = useState<EventDetail | null | undefined>(undefined);
  const [registration, setRegistration] = useState<Registration | null | undefined>(undefined);
  const [showForm, setShowForm] = useState(false);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [joinWaitlist, setJoinWaitlist] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadEvent = useCallback(async () => {
    const token = getAccessToken();
    const res = await fetch(`${API_URL}/api/v1/events/slug/${slug}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });
    setEvent(res.ok ? await res.json() : null);
  }, [slug]);

  useEffect(() => {
    void loadEvent();
  }, [loadEvent]);

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

  const cover = event.media[0];
  const applyLabel = event.approvalMode === "ORGANIZER_APPROVAL" ? t("registration.apply") : t("registration.register");

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {cover ? (
        <Image source={{ uri: cover.displayUrl }} style={styles.cover} resizeMode="cover" />
      ) : (
        <View style={[styles.cover, styles.coverPlaceholder]} />
      )}

      <Text style={styles.title}>{event.title}</Text>

      <View style={styles.metaRow}>
        {event.startsAt && <Text style={styles.meta}>{new Date(event.startsAt).toLocaleString(locale === "uk" ? "uk-UA" : "en-US")}</Text>}
        {event.format === "OFFLINE" && event.city && <Text style={styles.meta}>{event.city.nameUk}</Text>}
        {event.format === "ONLINE" && <Text style={styles.meta}>{t("events.wizard.formatOnline")}</Text>}
        <Text style={styles.meta}>{event.priceType === "FREE" ? t("common.free") : `${event.price ?? "?"} ${event.currency}`}</Text>
      </View>

      {event.friendsGoing.count > 0 && (
        <Text style={styles.meta}>
          👥 {event.friendsGoing.count} {event.friendsGoing.count === 1 ? t("profile.friendsGoingOne") : t("profile.friendsGoingMany")}
        </Text>
      )}

      {event.description && <Text style={styles.description}>{event.description}</Text>}

      {event.format === "OFFLINE" && event.addressText && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t("events.wizard.addressText")}</Text>
          <Text style={styles.meta}>{event.addressText}</Text>
        </View>
      )}

      {event.rules && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{locale === "uk" ? "Правила" : "Rules"}</Text>
          <Text style={styles.meta}>{event.rules}</Text>
        </View>
      )}

      <View style={styles.registrationBox}>
        {error && <Text style={styles.error}>{error}</Text>}
        {renderRegistration()}
      </View>
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
  cover: { width: "100%", aspectRatio: 3 / 4, borderRadius: radius.lg, backgroundColor: colors.surface },
  coverPlaceholder: {},
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
