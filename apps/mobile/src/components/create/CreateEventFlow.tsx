import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { API_URL, getAccessToken } from "../../lib/api-client";
import { ApiRequestError, useAuth } from "../../lib/auth-context";
import { useTranslations } from "../../lib/locale-context";
import { Button } from "../ui/Button";
import { ScreenHeader } from "../ui/ScreenHeader";
import { Chips, SearchPicker, Section, type Option } from "../discover/FiltersSheet";
import { AddressAutocomplete } from "./AddressAutocomplete";
import { colors, radius, spacing } from "../../lib/theme";

interface Named {
  id: string;
  nameUk: string;
  nameEn: string | null;
  children?: Named[];
}
interface MediaItem {
  id: string;
  type: "IMAGE" | "VIDEO";
  thumbnailUrl: string;
  displayUrl: string;
}
interface Form {
  title: string;
  description: string;
  categoryId: string | null;
  format: "OFFLINE" | "ONLINE";
  date: string;
  time: string;
  duration: string;
  cityId: string | null;
  districtId: string | null;
  addressText: string;
  googlePlaceId: string | null;
  latitude: number | null;
  longitude: number | null;
  onlineUrl: string;
  priceType: "FREE" | "PAID";
  price: string;
  capacity: string;
  minParticipants: string;
  approvalMode: "AUTO" | "ORGANIZER_APPROVAL";
  visibility: "PUBLIC" | "PRIVATE";
  adultsOnly: boolean;
  rules: string;
  paymentUrl: string;
}

const STEPS = 5;
const pad = (n: number) => String(n).padStart(2, "0");
const isoDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (days: number) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return isoDate(d);
};
/** Next occurrence of a weekday (0 Sun … 6 Sat), today included. */
const nextWeekday = (target: number) => addDays((target - new Date().getDay() + 7) % 7);

const INITIAL: Form = {
  title: "",
  description: "",
  categoryId: null,
  format: "OFFLINE",
  date: addDays(1),
  time: "19:00",
  duration: "2",
  cityId: null,
  districtId: null,
  addressText: "",
  googlePlaceId: null,
  latitude: null,
  longitude: null,
  onlineUrl: "",
  priceType: "FREE",
  price: "",
  capacity: "",
  minParticipants: "",
  approvalMode: "AUTO",
  visibility: "PUBLIC",
  adultsOnly: false,
  rules: "",
  paymentUrl: "",
};

async function authed(path: string, init: RequestInit = {}) {
  const token = getAccessToken();
  const res = await fetch(`${API_URL}/api/v1${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token ?? ""}`, ...(init.body && !(init.body instanceof FormData) ? { "Content-Type": "application/json" } : {}), ...init.headers },
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new ApiRequestError(body);
  return body;
}

/** Spec §31/§68: title -> media -> category/when/where -> price/seats -> publish, with the draft autosaved on every step. */
export function CreateEventFlow() {
  const { user, isLoading } = useAuth();
  const { t, locale } = useTranslations();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<Form>(INITIAL);
  const [eventId, setEventId] = useState<string | null>(null);
  const [slug, setSlug] = useState<string | null>(null);
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [categories, setCategories] = useState<Named[]>([]);
  const [cities, setCities] = useState<Named[]>([]);
  const [districts, setDistricts] = useState<Named[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [outcome, setOutcome] = useState<null | "PUBLISHED" | "PENDING_MODERATION" | "REJECTED">(null);
  const set = (patch: Partial<Form>) => setForm((f) => ({ ...f, ...patch }));
  const name = (n: Named) => (locale === "uk" ? n.nameUk : (n.nameEn ?? n.nameUk));

  useEffect(() => {
    void Promise.all([
      fetch(`${API_URL}/api/v1/categories`).then((r) => (r.ok ? r.json() : [])),
      fetch(`${API_URL}/api/v1/geography/cities`).then((r) => (r.ok ? r.json() : [])),
    ])
      .then(([c, ci]) => {
        setCategories(c as Named[]);
        setCities(ci as Named[]);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!form.cityId) {
      setDistricts([]);
      return;
    }
    void fetch(`${API_URL}/api/v1/geography/districts?cityId=${form.cityId}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setDistricts(d as Named[]))
      .catch(() => {});
  }, [form.cityId]);

  const loadBalance = useCallback(async () => {
    try {
      setBalance((await authed("/credits/balance")).balance);
    } catch {
      /* balance is informational */
    }
  }, []);

  useEffect(() => {
    if (step === STEPS - 1) void loadBalance();
  }, [step, loadBalance]);

  const startsAt = () => {
    const d = new Date(`${form.date}T${form.time}:00`);
    return Number.isNaN(d.getTime()) ? null : d;
  };

  /** The PATCH body for whatever the current step has collected. */
  function payloadFor(currentStep: number): Record<string, unknown> {
    if (currentStep === 0) return { description: form.description.trim() || undefined, categoryId: form.categoryId ?? undefined };
    if (currentStep === 2) {
      const start = startsAt();
      const hours = Math.max(0.5, Number(form.duration) || 2);
      return {
        format: form.format,
        startsAt: start?.toISOString(),
        endsAt: start ? new Date(start.getTime() + hours * 3_600_000).toISOString() : undefined,
        ...(form.format === "OFFLINE"
          ? {
              cityId: form.cityId ?? undefined,
              districtId: form.districtId ?? undefined,
              addressText: form.addressText.trim() || undefined,
              googlePlaceId: form.googlePlaceId ?? undefined,
              latitude: form.latitude ?? undefined,
              longitude: form.longitude ?? undefined,
            }
          : { onlineUrl: form.onlineUrl.trim() || undefined }),
      };
    }
    if (currentStep === 3) {
      return {
        priceType: form.priceType,
        price: form.priceType === "PAID" && form.price ? Number(form.price) : undefined,
        capacity: form.capacity ? Number(form.capacity) : undefined,
        minParticipants: form.minParticipants ? Number(form.minParticipants) : undefined,
        approvalMode: form.approvalMode,
        visibility: form.visibility,
        ageRestriction: form.adultsOnly ? 18 : 0,
        rules: form.rules.trim() || undefined,
        paymentUrl: form.priceType === "PAID" && form.paymentUrl.trim() ? form.paymentUrl.trim() : undefined,
      };
    }
    return {};
  }

  async function saveDraft(currentStep: number) {
    if (currentStep === 0) {
      if (form.title.trim().length < 3) throw new Error(t("create.titleTooShort"));
      if (!eventId) {
        const created = await authed("/events", { method: "POST", body: JSON.stringify({ title: form.title.trim() }) });
        setEventId(created.id);
        setSlug(created.slug);
        const extra = payloadFor(0);
        if (Object.values(extra).some((v) => v !== undefined)) {
          const updated = await authed(`/events/${created.id}`, { method: "PATCH", body: JSON.stringify(extra) });
          setSlug(updated.slug ?? created.slug);
        }
        return;
      }
      const updated = await authed(`/events/${eventId}`, { method: "PATCH", body: JSON.stringify({ title: form.title.trim(), ...payloadFor(0) }) });
      setSlug(updated.slug ?? slug);
      return;
    }
    const body = payloadFor(currentStep);
    if (eventId && Object.values(body).some((v) => v !== undefined)) {
      await authed(`/events/${eventId}`, { method: "PATCH", body: JSON.stringify(body) });
    }
  }

  async function next() {
    setError(null);
    setBusy(true);
    try {
      await saveDraft(step);
      setStep((s) => Math.min(STEPS - 1, s + 1));
    } catch (err) {
      setError(err instanceof ApiRequestError ? t(`errors.${err.code}`) : err instanceof Error ? err.message : t("common.somethingWentWrong"));
    } finally {
      setBusy(false);
    }
  }

  async function pickMedia() {
    if (!eventId) return;
    setError(null);
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images", "videos"],
      allowsMultipleSelection: true,
      selectionLimit: Math.max(1, 10 - media.length),
      quality: 0.85,
    });
    if (result.canceled) return;
    setBusy(true);
    try {
      for (const asset of result.assets) {
        const data = new FormData();
        const mime = asset.mimeType ?? (asset.type === "video" ? "video/mp4" : "image/jpeg");
        data.append("file", { uri: asset.uri, name: asset.fileName ?? `upload.${mime.split("/")[1] ?? "jpg"}`, type: mime } as unknown as Blob);
        const uploaded = await authed(`/events/${eventId}/media`, { method: "POST", body: data });
        setMedia((m) => [...m, uploaded]);
      }
    } catch (err) {
      setError(err instanceof ApiRequestError ? t(`errors.${err.code}`) : t("common.somethingWentWrong"));
    } finally {
      setBusy(false);
    }
  }

  async function removeMedia(id: string) {
    if (!eventId) return;
    await authed(`/events/${eventId}/media/${id}`, { method: "DELETE" }).catch(() => {});
    setMedia((m) => m.filter((x) => x.id !== id));
  }

  async function claimFree() {
    setBusy(true);
    try {
      setBalance((await authed("/credits/claim-free", { method: "POST" })).balance);
      setError(null);
    } catch {
      /* stays as is */
    } finally {
      setBusy(false);
    }
  }

  async function publish() {
    if (!eventId) return;
    setBusy(true);
    setError(null);
    try {
      const published = await authed(`/events/${eventId}/publish`, { method: "POST" });
      setSlug(published.slug ?? slug);
      setOutcome(published.status);
    } catch (err) {
      setError(err instanceof ApiRequestError ? t(`errors.${err.code}`) : t("common.somethingWentWrong"));
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setForm({ ...INITIAL, date: addDays(1) });
    setEventId(null);
    setSlug(null);
    setMedia([]);
    setOutcome(null);
    setError(null);
    setStep(0);
  }

  if (isLoading) return <ActivityIndicator style={{ marginTop: 80 }} color={colors.accentFrom} />;
  if (!user) {
    return (
      <View style={styles.flex}>
        <ScreenHeader title={t("nav.create")} subtitle={t("create.subtitle")} icon="add-circle" />
        <View style={styles.center}>
          <Ionicons name="lock-closed-outline" size={44} color={colors.muted} />
          <Text style={styles.muted}>{t("create.loginRequired")}</Text>
          <Button title={t("auth.login.title")} onPress={() => router.push("/login")} />
        </View>
      </View>
    );
  }

  if (outcome) {
    const ok = outcome === "PUBLISHED";
    return (
      <View style={styles.flex}>
        <ScreenHeader title={t("nav.create")} subtitle={t("create.subtitle")} icon="add-circle" />
        <View style={styles.center}>
          <Ionicons name={ok ? "checkmark-circle" : outcome === "REJECTED" ? "close-circle" : "time"} size={72} color={ok ? colors.success : outcome === "REJECTED" ? colors.danger : "#f59e0b"} />
          <Text style={styles.doneText}>
            {ok ? t("events.wizard.publishSuccess") : outcome === "REJECTED" ? t("events.wizard.publishRejected") : t("events.wizard.publishPendingModeration")}
          </Text>
          {ok && slug && <Button title={t("create.openEvent")} onPress={() => router.push(`/event/${slug}`)} />}
          {ok && slug && (
            <Button title={t("create.shareEvent")} variant="secondary" onPress={() => void Share.share({ message: `${form.title}\n${API_URL}/events/${slug}` }).catch(() => {})} />
          )}
          <Button title={t("create.createAnother")} variant="secondary" onPress={reset} />
        </View>
      </View>
    );
  }

  const categoryOptions: Option[] = categories.flatMap((c) => [{ id: c.id, label: name(c) }, ...(c.children ?? []).map((ch) => ({ id: ch.id, label: name(ch), indent: true }))]);
  const cityOptions: Option[] = cities.map((c) => ({ id: c.id, label: name(c) }));
  const districtOptions: Option[] = districts.map((d) => ({ id: d.id, label: name(d) }));
  const stepNames = [t("create.stepBasics"), t("create.stepMedia"), t("create.stepWhen"), t("create.stepPrice"), t("create.stepPreview")];
  const dateChips = [
    { value: addDays(0), label: t("create.today") },
    { value: addDays(1), label: t("create.tomorrow") },
    { value: nextWeekday(6), label: t("create.saturday") },
    { value: nextWeekday(0), label: t("create.sunday") },
  ];
  const durationChips = ["1", "2", "3", "4", "6"].map((h) => ({ value: h, label: `${h}` }));
  const summaryCategory = categoryOptions.find((c) => c.id === form.categoryId)?.label;
  const start = startsAt();

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView style={styles.flex} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <ScreenHeader title={t("nav.create")} subtitle={t("create.subtitle")} icon="add-circle" />

        <View style={styles.progress}>
          <Text style={styles.stepLabel}>
            {t("create.step")} {step + 1} {t("create.of")} {STEPS} · {stepNames[step]}
          </Text>
          <View style={styles.bar}>
            <View style={[styles.barFill, { width: `${((step + 1) / STEPS) * 100}%` }]} />
          </View>
        </View>

        {step === 0 && (
          <>
            <Field label={t("events.wizard.title")}>
              <TextInput value={form.title} onChangeText={(v) => set({ title: v })} placeholder={t("events.wizard.titlePlaceholder")} placeholderTextColor={colors.muted} style={styles.input} maxLength={120} />
            </Field>
            <Section title={t("events.wizard.category")}>
              <SearchPicker options={categoryOptions} selected={form.categoryId ? [form.categoryId] : []} multi={false} onChange={(ids) => set({ categoryId: ids[0] ?? null })} placeholder={t("filters.search")} emptyLabel={t("filters.noResults")} />
            </Section>
            <Field label={t("events.wizard.description")}>
              <TextInput value={form.description} onChangeText={(v) => set({ description: v })} placeholder={t("events.wizard.descriptionPlaceholder")} placeholderTextColor={colors.muted} style={[styles.input, styles.multiline]} multiline />
            </Field>
          </>
        )}

        {step === 1 && (
          <>
            <Text style={styles.muted}>{t("create.mediaHint")}</Text>
            <View style={styles.mediaGrid}>
              {media.map((m, i) => (
                <View key={m.id} style={styles.mediaCell}>
                  <Image source={{ uri: m.thumbnailUrl }} style={styles.mediaImg} />
                  {m.type === "VIDEO" && <Ionicons name="play-circle" size={26} color={colors.white} style={styles.mediaPlay} />}
                  {i === 0 && (
                    <View style={styles.coverBadge}>
                      <Text style={styles.coverBadgeText}>1</Text>
                    </View>
                  )}
                  <Pressable style={styles.mediaRemove} onPress={() => void removeMedia(m.id)} hitSlop={8}>
                    <Ionicons name="close" size={16} color={colors.white} />
                  </Pressable>
                </View>
              ))}
              {media.length < 10 && (
                <Pressable style={[styles.mediaCell, styles.mediaAdd]} onPress={() => void pickMedia()} disabled={busy}>
                  {busy ? <ActivityIndicator color={colors.accentFrom} /> : <Ionicons name="add" size={32} color={colors.accentFrom} />}
                </Pressable>
              )}
            </View>
          </>
        )}

        {step === 2 && (
          <>
            <Section title={t("events.wizard.format")}>
              <Chips
                value={form.format}
                options={[
                  { value: "OFFLINE" as const, label: t("events.wizard.formatOffline") },
                  { value: "ONLINE" as const, label: t("events.wizard.formatOnline") },
                ]}
                onChange={(v) => set({ format: v })}
              />
            </Section>
            <Section title={t("create.date")}>
              <Chips value={form.date} options={dateChips} onChange={(v) => set({ date: v })} />
              <TextInput value={form.date} onChangeText={(v) => set({ date: v })} placeholder={t("create.dateHint")} placeholderTextColor={colors.muted} style={styles.input} keyboardType="numbers-and-punctuation" maxLength={10} />
            </Section>
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Field label={t("create.time")}>
                  <TextInput value={form.time} onChangeText={(v) => set({ time: v })} placeholder={t("create.timeHint")} placeholderTextColor={colors.muted} style={styles.input} keyboardType="numbers-and-punctuation" maxLength={5} />
                </Field>
              </View>
            </View>
            <Section title={t("create.duration")}>
              <Chips value={form.duration} options={durationChips} onChange={(v) => set({ duration: v })} />
            </Section>
            {form.format === "OFFLINE" ? (
              <>
                <Section title={t("events.wizard.city")}>
                  <SearchPicker options={cityOptions} selected={form.cityId ? [form.cityId] : []} multi={false} onChange={(ids) => set({ cityId: ids[0] ?? null, districtId: null })} placeholder={t("filters.search")} emptyLabel={t("filters.noResults")} />
                </Section>
                {form.cityId && districtOptions.length > 0 && (
                  <Section title={`${t("events.wizard.district")} (${t("create.optional")})`}>
                    <SearchPicker options={districtOptions} selected={form.districtId ? [form.districtId] : []} multi={false} onChange={(ids) => set({ districtId: ids[0] ?? null })} placeholder={t("filters.search")} emptyLabel={t("filters.noResults")} />
                  </Section>
                )}
                <Field label={t("events.wizard.addressText")}>
                  <AddressAutocomplete value={form.addressText} onPick={(place) => set(place)} placeholder={t("events.wizard.addressPlaceholder")} />
                </Field>
              </>
            ) : (
              <Field label={t("events.wizard.onlineUrl")}>
                <TextInput value={form.onlineUrl} onChangeText={(v) => set({ onlineUrl: v })} placeholder="https://" placeholderTextColor={colors.muted} style={styles.input} autoCapitalize="none" keyboardType="url" />
              </Field>
            )}
          </>
        )}

        {step === 3 && (
          <>
            <Section title={t("events.wizard.priceType")}>
              <Chips
                value={form.priceType}
                options={[
                  { value: "FREE" as const, label: t("events.wizard.priceFree") },
                  { value: "PAID" as const, label: t("events.wizard.pricePaid") },
                ]}
                onChange={(v) => set({ priceType: v })}
              />
            </Section>
            {form.priceType === "PAID" && (
              <>
                <Field label={t("events.wizard.priceAmount")}>
                  <TextInput value={form.price} onChangeText={(v) => set({ price: v.replace(/[^0-9.]/g, "") })} style={styles.input} keyboardType="decimal-pad" placeholder="350" placeholderTextColor={colors.muted} />
                </Field>
                <Field label={t("events.wizard.paymentUrl")}>
                  <TextInput value={form.paymentUrl} onChangeText={(v) => set({ paymentUrl: v })} style={styles.input} autoCapitalize="none" keyboardType="url" placeholder="https://" placeholderTextColor={colors.muted} />
                </Field>
              </>
            )}
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Field label={t("create.maxPeople")}>
                  <TextInput value={form.capacity} onChangeText={(v) => set({ capacity: v.replace(/\D/g, "") })} style={styles.input} keyboardType="number-pad" placeholder="20" placeholderTextColor={colors.muted} />
                </Field>
              </View>
              <View style={{ flex: 1 }}>
                <Field label={t("create.minPeople")}>
                  <TextInput value={form.minParticipants} onChangeText={(v) => set({ minParticipants: v.replace(/\D/g, "") })} style={styles.input} keyboardType="number-pad" placeholder="8" placeholderTextColor={colors.muted} />
                </Field>
              </View>
            </View>
            <Section title={t("events.wizard.approvalMode")}>
              <Chips
                value={form.approvalMode}
                options={[
                  { value: "AUTO" as const, label: t("events.wizard.approvalAuto") },
                  { value: "ORGANIZER_APPROVAL" as const, label: t("events.wizard.approvalManual") },
                ]}
                onChange={(v) => set({ approvalMode: v })}
              />
            </Section>
            <Section title={t("events.wizard.visibility")}>
              <Chips
                value={form.visibility}
                options={[
                  { value: "PUBLIC" as const, label: t("events.wizard.visibilityPublic") },
                  { value: "PRIVATE" as const, label: t("events.wizard.visibilityLink") },
                ]}
                onChange={(v) => set({ visibility: v })}
              />
            </Section>
            <Section title={t("events.wizard.adultsOnly")}>
              <Chips
                value={form.adultsOnly ? "yes" : "no"}
                options={[
                  { value: "no" as const, label: t("common.no") },
                  { value: "yes" as const, label: "18+" },
                ]}
                onChange={(v) => set({ adultsOnly: v === "yes" })}
              />
            </Section>
            <Field label={t("events.wizard.rules")}>
              <TextInput value={form.rules} onChangeText={(v) => set({ rules: v })} style={[styles.input, styles.multiline]} multiline maxLength={10000} placeholderTextColor={colors.muted} />
            </Field>
          </>
        )}

        {step === 4 && (
          <>
            <Text style={styles.summaryTitle}>{t("create.summary")}</Text>
            <View style={styles.summary}>
              <Text style={styles.summaryHeading}>{form.title}</Text>
              {summaryCategory && <Text style={styles.summaryLine}>{summaryCategory}</Text>}
              {start && <Text style={styles.summaryLine}>{start.toLocaleString(locale === "uk" ? "uk-UA" : "en-US", { weekday: "short", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })}</Text>}
              <Text style={styles.summaryLine}>
                {form.format === "OFFLINE" ? [cityOptions.find((c) => c.id === form.cityId)?.label, form.addressText].filter(Boolean).join(", ") : form.onlineUrl}
              </Text>
              <Text style={styles.summaryLine}>{form.priceType === "FREE" ? t("common.free") : `${form.price || "?"} UAH`}</Text>
              <Text style={styles.summaryLine}>{media.length} {t("create.stepMedia").toLowerCase()}</Text>
            </View>
            {balance !== null && (
              <Text style={styles.summaryLine}>
                {t("events.wizard.creditsBalance")}: <Text style={{ fontWeight: "800", color: colors.foreground }}>{balance}</Text>
              </Text>
            )}
            {balance === 0 && <Button title={t("events.wizard.claimFreeCredits")} variant="secondary" onPress={() => void claimFree()} loading={busy} />}
          </>
        )}

        {error && <Text style={styles.error}>{error}</Text>}

        <View style={styles.nav}>
          {step > 0 && <Button title={t("create.back")} variant="secondary" onPress={() => setStep((s) => s - 1)} style={{ flex: 1 }} />}
          {step < STEPS - 1 ? (
            <Button title={t("create.next")} onPress={() => void next()} loading={busy} style={{ flex: 2 }} />
          ) : (
            <Button title={t("events.wizard.publish")} onPress={() => void publish()} loading={busy} style={{ flex: 2 }} />
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={styles.label}>{label}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl * 2, gap: spacing.lg },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.md, padding: spacing.xl },
  muted: { color: colors.muted, fontSize: 14, textAlign: "center" },
  progress: { gap: 8 },
  stepLabel: { color: colors.muted, fontSize: 13, fontWeight: "600" },
  bar: { height: 6, borderRadius: 3, backgroundColor: colors.surface, overflow: "hidden" },
  barFill: { height: 6, borderRadius: 3, backgroundColor: colors.accentFrom },
  label: { color: colors.foreground, fontSize: 14, fontWeight: "700" },
  input: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, color: colors.foreground, paddingHorizontal: spacing.md, paddingVertical: 12, fontSize: 15 },
  multiline: { minHeight: 110, textAlignVertical: "top" },
  row: { flexDirection: "row", gap: spacing.md },
  mediaGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  mediaCell: { width: "31%", aspectRatio: 3 / 4, borderRadius: radius.md, overflow: "hidden", backgroundColor: colors.surface },
  mediaImg: { width: "100%", height: "100%" },
  mediaPlay: { position: "absolute", top: "40%", left: "38%" },
  mediaAdd: { borderWidth: 1.5, borderStyle: "dashed", borderColor: colors.accentFrom, alignItems: "center", justifyContent: "center" },
  mediaRemove: { position: "absolute", top: 4, right: 4, width: 24, height: 24, borderRadius: 12, backgroundColor: "rgba(0,0,0,0.6)", alignItems: "center", justifyContent: "center" },
  coverBadge: { position: "absolute", bottom: 4, left: 4, backgroundColor: colors.accentFrom, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 },
  coverBadgeText: { color: colors.white, fontSize: 11, fontWeight: "800" },
  summaryTitle: { color: colors.foreground, fontSize: 16, fontWeight: "800" },
  summary: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, gap: 6 },
  summaryHeading: { color: colors.foreground, fontSize: 20, fontWeight: "800" },
  summaryLine: { color: colors.muted, fontSize: 14 },
  doneText: { color: colors.foreground, fontSize: 16, textAlign: "center", fontWeight: "600" },
  error: { color: colors.danger, fontSize: 14, textAlign: "center" },
  nav: { flexDirection: "row", gap: spacing.md },
});
