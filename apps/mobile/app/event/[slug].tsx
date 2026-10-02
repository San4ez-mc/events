import { useCallback, useEffect, useRef, useState } from "react";
import { captureEvent } from "../../src/lib/product-analytics";
import { router, useLocalSearchParams } from "expo-router";
import { ActivityIndicator, Alert, Image, KeyboardAvoidingView, Linking, Modal, Platform, Pressable, ScrollView, Share, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { API_URL, getAccessToken } from "../../src/lib/api-client";
import { ApiRequestError, useAuth } from "../../src/lib/auth-context";
import { useTranslations } from "../../src/lib/locale-context";
import { Button } from "../../src/components/ui/Button";
import { RegistrationFieldInput } from "../../src/components/registration/RegistrationFieldInput";
import { EventGallery } from "../../src/components/event/EventGallery";
import { EventQrModal } from "../../src/components/social/EventQrModal";
import { EventChat } from "../../src/components/event/EventChat";
import { ReviewsSection } from "../../src/components/event/ReviewsSection";
import { sourceFromParam, track } from "../../src/lib/analytics";
import { formatCurrency, formatPriceLabel, formatShortDateTime } from "../../src/lib/format";
import type { EventDetail, Registration } from "../../src/lib/event-types";
import { radius, spacing, type Palette, useThemedStyles } from "../../src/lib/theme";

/** Pulls the video id out of any common YouTube URL shape (watch?v=, youtu.be/, /embed/, /shorts/). */
function youtubeEmbedId(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{11})/.exec(url);
  return m?.[1] ?? null;
}

export default function EventDetailScreen() {
  const { colors, styles } = useThemedStyles(makeStyles);
  const { slug, src } = useLocalSearchParams<{ slug: string; src?: string }>();
  const { user, isLoading: authLoading } = useAuth();
  const { t } = useTranslations();

  const [event, setEvent] = useState<EventDetail | null | undefined>(undefined);
  const [loadFailed, setLoadFailed] = useState(false);
  const [registration, setRegistration] = useState<Registration | null | undefined>(undefined);
  const [showForm, setShowForm] = useState(false);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [joinWaitlist, setJoinWaitlist] = useState(false);
  const [showAsParticipant, setShowAsParticipant] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [saved, setSaved] = useState(false);
  const [tierId, setTierId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const insets = useSafeAreaInsets();

  const loadEvent = useCallback(async () => {
    const token = getAccessToken();
    try {
      const res = await fetch(`${API_URL}/api/v1/events/slug/${slug}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      // Only a real 404/403 means "no such event" — offline or a 5xx/429 used to read as "not found",
      // or (offline) spun forever.
      if (!res.ok && res.status !== 404 && res.status !== 403) throw new Error(String(res.status));
      const body = res.ok ? await res.json() : null;
      setLoadFailed(false);
      setEvent(body);
      if (body) setSaved(Boolean(body.viewerSaved));
    } catch {
      setLoadFailed(true);
    }
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
      try {
        const res = await fetch(`${API_URL}/api/v1/events/${event.id}/registrations/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        // A failed or stale-token (401) response must still resolve `registration` out of
        // `undefined` — otherwise renderRegistration() shows its loading spinner forever (it was
        // doing exactly that: a dead purple ActivityIndicator stuck above the footer, reported as
        // "a purple circle that does nothing" on events the viewer hadn't registered for).
        setRegistration(res.ok ? (await res.json()).registration : null);
      } catch {
        setRegistration(null);
      }
    })();
  }, [authLoading, user, event]);

  /**
   * Save doubles as "follow" (UX §25): saving an event also subscribes the viewer to its updates,
   * so there is one button/concept instead of two ("save" and a separate bell that only differed
   * by which endpoint it hit) — they read as duplicates of each other in the UI.
   */
  async function toggleSave() {
    const token = getAccessToken();
    if (!token || !event) {
      router.push("/login");
      return;
    }
    const next = !saved;
    setSaved(next);
    captureEvent(next ? "event_save" : "event_unsave", { event_id: event.id, category: event.category?.nameUk, city: event.city?.nameUk, from: "event_page" });
    const method = next ? "POST" : "DELETE";
    const headers = { Authorization: `Bearer ${token}` };
    const [saveRes] = await Promise.all([
      fetch(`${API_URL}/api/v1/discovery/${event.id}/save`, { method, headers }).catch(() => null),
      fetch(`${API_URL}/api/v1/events/${event.id}/subscribe`, { method, headers }).catch(() => null),
    ]);
    if (!saveRes?.ok) setSaved(!next);
  }

  const REPORT_REASONS = ["spam", "fraud", "inappropriate", "wrongInfo", "other"] as const;

  function openReportMenu() {
    if (!getAccessToken() || !event) {
      router.push("/login");
      return;
    }
    setReportOpen(true);
  }

  // A native Alert with 5 reasons + Cancel (6 buttons) silently drops buttons past the 3rd on Android — that's
  // why "Скасувати" used to disappear and the popup felt stuck. A real Modal has no such limit and is always
  // dismissable (backdrop tap, hardware back, or the close button).
  async function sendReport(reason: string) {
    const token = getAccessToken();
    setReportOpen(false);
    if (!token || !event) return;
    const res = await fetch(`${API_URL}/api/v1/reports`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ targetType: "EVENT", targetId: event.id, reason }),
    }).catch(() => null);
    Alert.alert(res?.ok ? t("events.actions.reportSent") : t("common.somethingWentWrong"));
  }

  // §19/§70 — copies title/description/category/location/etc. into a fresh DRAFT; nothing about
  // the original (registrations, status, series membership) carries over.
  async function duplicateEvent() {
    const token = getAccessToken();
    if (!token || !event) return;
    setReportOpen(false);
    const res = await fetch(`${API_URL}/api/v1/events/${event.id}/duplicate`, { method: "POST", headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) {
      Alert.alert(t("common.somethingWentWrong"));
      return;
    }
    const created = (await res.json()) as { id: string };
    router.push(`/edit/${created.id}`);
  }

  /** Downloads the server-generated .ics (no Google/calendar API involved — a plain file every
   * calendar app, including Google Calendar, already knows how to import) and hands it to the
   * OS share sheet so the user picks their calendar app directly. */
  async function addToCalendar() {
    if (!event) return;
    try {
      const file = await File.downloadFileAsync(`${API_URL}/api/v1/events/${event.id}/calendar.ics`, Paths.cache, { idempotent: true });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(file.uri, { mimeType: "text/calendar", dialogTitle: t("events.actions.addToCalendar") });
      } else {
        Alert.alert(t("common.somethingWentWrong"));
      }
    } catch {
      Alert.alert(t("common.somethingWentWrong"));
    }
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
          showAsParticipant,
          priceOptionId: (event.priceOptions?.length ?? 0) > 0 ? (tierId ?? event.priceOptions?.find((o) => !o.soldOut)?.id) : undefined,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new ApiRequestError(body);
      setRegistration(body);
      setShowForm(false);
      captureEvent("registration_completed", { event_id: event.id, category: event.category?.nameUk, city: event.city?.nameUk, paid: event.priceType === "PAID", status: body.status });
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
        {loadFailed ? (
          <>
            <Text style={styles.muted}>{t("common.somethingWentWrong")}</Text>
            <Button
              title={t("common.retry")}
              variant="secondary"
              onPress={() => {
                setLoadFailed(false);
                void loadEvent();
              }}
            />
          </>
        ) : (
          <ActivityIndicator color={colors.accentFrom} />
        )}
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

  const isOwner = !!user && !!organizer && organizer.id === user.id;

  return (
    <>
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : "height"}>
      <ScrollView ref={scrollRef} style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.galleryBleed}>
        <EventGallery media={event.media} />
      </View>
      {youtubeEmbedId(event.youtubeUrl) && (
        <Pressable style={styles.youtubeCard} onPress={() => void Linking.openURL(event.youtubeUrl!)}>
          <Image source={{ uri: `https://img.youtube.com/vi/${youtubeEmbedId(event.youtubeUrl)}/hqdefault.jpg` }} style={styles.youtubeThumb} />
          <View style={styles.youtubePlay}>
            <Ionicons name="logo-youtube" size={28} color={colors.white} />
          </View>
        </Pressable>
      )}

      {event.isTest && (
        <View style={styles.testBadge}>
          <Text style={styles.testBadgeText}>{t("events.testBadge")}</Text>
        </View>
      )}
      {/* Title gets the full row's width to itself — it used to share the row with up to 4 icon
          buttons, which squeezed a longer title down to a sliver and wrapped it mid-word. */}
      <Text style={styles.title}>{event.title}</Text>
      <View style={styles.titleActions}>
        {isOwner && (
          <Pressable style={styles.shareButton} onPress={() => router.push(`/edit/${event.id}`)} accessibilityLabel={t("common.edit")}>
            <Ionicons name="pencil-outline" size={20} color={colors.foreground} />
          </Pressable>
        )}
        {isOwner && !event.seriesId && event.startsAt && (
          <Pressable style={styles.shareButton} onPress={() => router.push(`/series/${event.id}`)} accessibilityLabel={t("organizerSeries.title")}>
            <Ionicons name="repeat" size={20} color={colors.foreground} />
          </Pressable>
        )}
        {isOwner && (
          <Pressable style={styles.shareButton} onPress={() => void duplicateEvent()} accessibilityLabel={t("organizerTools.duplicate")}>
            <Ionicons name="copy-outline" size={20} color={colors.foreground} />
          </Pressable>
        )}
        <Pressable style={styles.shareButton} onPress={() => void toggleSave()} accessibilityLabel={saved ? t("events.actions.saved") : t("events.actions.save")}>
          <Ionicons name={saved ? "heart" : "heart-outline"} size={22} color={saved ? colors.accentTo : colors.foreground} />
        </Pressable>
        {event.startsAt && (
          <Pressable style={styles.shareButton} onPress={() => void addToCalendar()} accessibilityLabel={t("events.actions.addToCalendar")}>
            <Ionicons name="calendar-outline" size={20} color={colors.foreground} />
          </Pressable>
        )}
        <Pressable
          style={styles.shareButton}
          onPress={() => { track(event.id, "SHARE"); void Share.share({ message: `${event.title}\n${API_URL}/events/${event.slug}?utm_source=app_share&utm_medium=share`, url: `${API_URL}/events/${event.slug}?utm_source=app_share&utm_medium=share` }).catch(() => {}); }}
          accessibilityLabel={t("discover.share")}
        >
          <Ionicons name="share-social-outline" size={22} color={colors.foreground} />
        </Pressable>
        <Pressable style={styles.shareButton} onPress={openReportMenu} accessibilityLabel={t("common.more")}>
          <Ionicons name="ellipsis-horizontal" size={20} color={colors.foreground} />
        </Pressable>
      </View>

      <View style={styles.metaRow}>
        {event.startsAt && <Text style={styles.meta}>{formatShortDateTime(event.startsAt)}</Text>}
        {event.format === "OFFLINE" && event.city && <Text style={styles.meta}>{event.city.nameUk}</Text>}
        {event.format === "ONLINE" && <Text style={styles.meta}>{t("events.wizard.formatOnline")}</Text>}
        <Text style={styles.meta}>{formatPriceLabel(event, t)}</Text>
      </View>

      {event.additionalCategories && event.additionalCategories.length > 0 && (
        <View style={styles.categoryChips}>
          {event.additionalCategories.map(({ category }) => (
            <View key={category.id} style={styles.categoryChip}>
              <Text style={styles.categoryChipText}>{category.nameUk}</Text>
            </View>
          ))}
        </View>
      )}

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
          <Text style={styles.sectionTitle}>{t("events.page.rules")}</Text>
          <Text style={styles.meta}>{event.rules}</Text>
        </View>
      )}

      {event.priceOptions && event.priceOptions.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t("registration.ticketType")}</Text>
          {event.priceOptions.map((o) => (
            <Text key={o.id} style={styles.meta}>
              {o.name} — {Number(o.price) === 0 ? t("common.free") : `${Number(o.price)} ${formatCurrency(event.currency)}`}
              {o.soldOut ? ` (${t("events.page.soldOut")})` : ""}
            </Text>
          ))}
        </View>
      )}

      {event.faqItems && event.faqItems.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t("events.page.faq")}</Text>
          {event.faqItems.map((item) => (
            <View key={item.id} style={{ marginBottom: spacing.sm }}>
              <Text style={[styles.meta, { fontWeight: "700", color: colors.foreground }]}>{item.question}</Text>
              <Text style={styles.meta}>{item.answer}</Text>
            </View>
          ))}
        </View>
      )}

      {event.participants && event.participants.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            {t("events.page.participants")} · {social?.registeredCount ?? event.participants.length}
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ gap: spacing.md }}>
            {event.participants.map((p) => (
              <Pressable key={p.id} style={styles.participant} onPress={() => router.push(`/users/${p.id}`)}>
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
              </Pressable>
            ))}
          </ScrollView>
        </View>
      )}

      <ReviewsSection eventId={event.id} eventStatus={event.status} summary={event.reviewSummary} />

      <EventChat
        eventId={event.id}
        refreshKey={registration?.status ?? "none"}
        onInputFocus={() => setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 150)}
      />

      </ScrollView>

      {/* Sticky so the primary action is always reachable without scrolling to the bottom (UX §67). */}
      <View style={[styles.stickyFooter, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
        <View style={styles.registrationBox}>
          {error && <Text style={styles.error}>{error}</Text>}
          {renderRegistration()}
          {/* Donation events: entry is free, and giving doesn't depend on registering, so the link is always there. */}
          {event.priceType === "DONATION" && event.paymentUrl ? (
            <Button title={t("registration.donate")} variant="secondary" onPress={() => void Linking.openURL(event.paymentUrl!)} />
          ) : null}
        </View>
        {event.priceType === "PAID" && <Text style={styles.disclaimer}>{t("events.page.paidDisclaimer")}</Text>}
      </View>
      </KeyboardAvoidingView>

      <Modal visible={reportOpen} transparent animationType="fade" onRequestClose={() => setReportOpen(false)}>
        <Pressable style={styles.reportBackdrop} onPress={() => setReportOpen(false)}>
          <Pressable style={styles.reportSheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.reportHeader}>
              <Text style={styles.reportTitle}>{isOwner ? t("common.more") : t("events.actions.report")}</Text>
              <Pressable onPress={() => setReportOpen(false)} hitSlop={10} accessibilityLabel={t("common.cancel")}>
                <Ionicons name="close" size={22} color={colors.foreground} />
              </Pressable>
            </View>
            {isOwner && (
              <Pressable style={styles.reportRow} onPress={() => { setReportOpen(false); setQrOpen(true); }}>
                <Text style={styles.reportRowText}>{t("events.actions.qr")}</Text>
              </Pressable>
            )}
            {isOwner && (
              <Pressable style={styles.reportRow} onPress={() => { setReportOpen(false); router.push(`/collaborators/${event.id}`); }}>
                <Text style={styles.reportRowText}>{t("organizerCollaborators.title")}</Text>
              </Pressable>
            )}
            {isOwner && (
              <Pressable style={styles.reportRow} onPress={() => { setReportOpen(false); router.push(`/invite/${event.id}`); }}>
                <Text style={styles.reportRowText}>{t("organizerInvite.title")}</Text>
              </Pressable>
            )}
            {(event.status === "PUBLISHED" || event.status === "COMPLETED") && (
              <Pressable style={styles.reportRow} onPress={() => { setReportOpen(false); router.push(`/share/${event.id}`); }}>
                <Text style={styles.reportRowText}>{t("referral.title")}</Text>
              </Pressable>
            )}
            {!isOwner &&
              REPORT_REASONS.map((r) => (
                <Pressable key={r} style={styles.reportRow} onPress={() => void sendReport(t(`events.actions.reasons.${r}`))}>
                  <Text style={styles.reportRowText}>{t(`events.actions.reasons.${r}`)}</Text>
                </Pressable>
              ))}
            <Pressable style={styles.reportCancel} onPress={() => setReportOpen(false)}>
              <Text style={styles.reportCancelText}>{t("common.cancel")}</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
      {event && <EventQrModal eventId={event.id} title={event.title} visible={qrOpen} onClose={() => setQrOpen(false)} />}
    </>
  );

  function renderRegistration() {
    if (!event) return null;
    if (event.status === "CANCELLED") return <Text style={styles.error}>{t("registration.eventCancelled")}</Text>;
    if (event.status !== "PUBLISHED") return <Text style={styles.muted}>{t("registration.registrationClosed")}</Text>;

    if (authLoading || registration === undefined) return <ActivityIndicator color={colors.accentFrom} />;
    if (!user) return <Button title={t("auth.login.title")} onPress={() => router.push("/login")} />;

    if (!registration || registration.status === "CANCELLED" || registration.status === "REJECTED") {
      const tiers = event.priceOptions ?? [];
      const chosen = tierId ?? tiers.find((o) => !o.soldOut)?.id ?? null;
      const tierPicker =
        tiers.length > 0 ? (
          <View style={{ gap: spacing.sm }}>
            <Text style={styles.sectionTitle}>{t("registration.ticketType")}</Text>
            {tiers.map((o) => (
              <Pressable
                key={o.id}
                disabled={o.soldOut}
                onPress={() => setTierId(o.id)}
                style={[styles.tier, chosen === o.id && styles.tierOn, o.soldOut && { opacity: 0.5 }]}
              >
                <Text style={styles.tierName}>
                  {o.name}
                  {o.soldOut ? ` · ${t("events.page.soldOut")}` : ""}
                </Text>
                <Text style={styles.tierName}>{Number(o.price) === 0 ? t("common.free") : `${Number(o.price)} ${formatCurrency(event.currency)}`}</Text>
              </Pressable>
            ))}
          </View>
        ) : null;
      // UX §83 — opt-in, off by default; the public attendee preview never shows someone who didn't ask to be shown.
      const participantToggle = (
        <Pressable
          onPress={() => setShowAsParticipant((v) => !v)}
          style={styles.participantToggle}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: showAsParticipant }}
        >
          <Ionicons name={showAsParticipant ? "checkbox" : "square-outline"} size={20} color={showAsParticipant ? colors.accentFrom : colors.muted} />
          <Text style={styles.participantToggleLabel}>{t("registration.showAsParticipant")}</Text>
        </Pressable>
      );
      if (showForm && event.registrationFields.length > 0) {
        return (
          <View style={styles.form}>
            {tierPicker}
            {event.registrationFields.map((field) => (
              <RegistrationFieldInput
                key={field.id}
                field={field}
                value={answers[field.id]}
                onChange={(value) => setAnswers((a) => ({ ...a, [field.id]: value }))}
              />
            ))}
            {participantToggle}
            <Button title={joinWaitlist ? t("registration.joinWaitlist") : t("registration.submitApplication")} onPress={() => void submit()} loading={submitting} />
          </View>
        );
      }
      return (
        <View style={styles.form}>
          {tierPicker}
          {participantToggle}
          <Button
            title={joinWaitlist ? t("registration.joinWaitlist") : applyLabel}
            onPress={() => (event.registrationFields.length > 0 ? setShowForm(true) : void submit())}
            loading={submitting}
            disabled={tiers.length > 0 && !chosen}
          />
        </View>
      );
    }

    if (registration.status === "PENDING") return <Text style={styles.muted}>{t("registration.pending")}</Text>;
    if (registration.status === "WAITLISTED") return <Text style={styles.muted}>{t("registration.waitlisted")}</Text>;
    if (registration.status === "PAYMENT_PENDING") return <Text style={styles.muted}>{t("registration.paymentPendingConfirmation")}</Text>;

    if (registration.status === "REGISTERED" && event.priceType === "PAID") {
      return (
        <View style={styles.form}>
          <Text style={styles.muted}>{t("registration.registered")}</Text>
          {event.paymentUrl ? <Button title={t("registration.payNow")} variant="secondary" onPress={() => void Linking.openURL(event.paymentUrl!)} /> : null}
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

const makeStyles = (colors: Palette) => StyleSheet.create({
  tier: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.md, paddingVertical: spacing.md },
  tierOn: { borderColor: colors.accentFrom, backgroundColor: colors.surface },
  tierName: { color: colors.foreground, fontSize: 14, fontWeight: "600" },
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl * 2, gap: spacing.md },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background },
  galleryBleed: { marginHorizontal: -spacing.lg, marginTop: -spacing.lg },
  youtubeCard: { aspectRatio: 16 / 9, borderRadius: radius.lg, overflow: "hidden", backgroundColor: colors.surface },
  youtubeThumb: { width: "100%", height: "100%" },
  youtubePlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.25)" },
  titleActions: { flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: spacing.sm, flexWrap: "wrap" },
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
  testBadge: { alignSelf: "flex-start", backgroundColor: colors.danger, borderRadius: radius.full, paddingHorizontal: 10, paddingVertical: 4, marginBottom: 4 },
  testBadgeText: { color: colors.white, fontSize: 11, fontWeight: "800" },
  metaRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  meta: { color: colors.muted, fontSize: 13 },
  categoryChips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  categoryChip: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.full, paddingHorizontal: 10, paddingVertical: 4 },
  categoryChipText: { color: colors.muted, fontSize: 12 },
  description: { color: colors.foreground, fontSize: 14, lineHeight: 20 },
  section: { gap: spacing.xs },
  sectionTitle: { color: colors.foreground, fontSize: 14, fontWeight: "600" },
  stickyFooter: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, backgroundColor: colors.background, paddingHorizontal: spacing.lg, paddingTop: spacing.md, gap: spacing.sm },
  registrationBox: { gap: spacing.sm },
  form: { gap: spacing.sm },
  participantToggle: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  participantToggleLabel: { color: colors.foreground, fontSize: 13, flexShrink: 1 },
  error: { color: colors.danger, fontSize: 13, textAlign: "center" },
  muted: { color: colors.muted, fontSize: 14, textAlign: "center" },
  reportBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  reportSheet: { backgroundColor: colors.background, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, paddingBottom: spacing.xl, paddingTop: spacing.md },
  reportHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingBottom: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  reportTitle: { color: colors.foreground, fontSize: 16, fontWeight: "700" },
  reportRow: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  reportRowText: { color: colors.foreground, fontSize: 15 },
  reportCancel: { marginTop: spacing.md, marginHorizontal: spacing.lg, paddingVertical: spacing.md, borderRadius: radius.md, backgroundColor: colors.surface, alignItems: "center" },
  reportCancelText: { color: colors.foreground, fontSize: 15, fontWeight: "700" },
});
