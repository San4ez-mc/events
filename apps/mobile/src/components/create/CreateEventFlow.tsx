import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, Image, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { File } from "expo-file-system";
import * as SecureStore from "expo-secure-store";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { API_URL, getAccessToken, refreshAccessToken } from "../../lib/api-client";
import { ApiRequestError, useAuth } from "../../lib/auth-context";
import { reportClientError } from "../../lib/crash-reporter";
import { useTranslations } from "../../lib/locale-context";
import { formatPriceLabel, formatShortDateTime } from "../../lib/format";
import { Button } from "../ui/Button";
import { ScreenHeader } from "../ui/ScreenHeader";
import { Chips, SearchPicker, Section, type Option } from "../discover/FiltersSheet";
import { CalendarPicker } from "../discover/CalendarPicker";
import { AddressAutocomplete } from "./AddressAutocomplete";
import { radius, spacing, type Palette, useThemedStyles } from "../../lib/theme";

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
/** Shape of GET /events/:id, as loaded into the wizard's Form when editing an existing event. */
interface EventDetail {
  id: string;
  slug: string;
  status: "PUBLISHED" | "PENDING_MODERATION" | "REJECTED" | string;
  media?: MediaItem[];
  title: string;
  description: string | null;
  categoryId: string | null;
  format: "OFFLINE" | "ONLINE";
  startsAt: string | null;
  endsAt: string | null;
  cityId: string | null;
  districtId: string | null;
  addressText: string | null;
  googlePlaceId: string | null;
  latitude: number | string | null;
  longitude: number | string | null;
  onlineUrl: string | null;
  youtubeUrl: string | null;
  priceType: "FREE" | "PAID";
  price: number | string | null;
  capacity: number | string | null;
  minParticipants: number | string | null;
  approvalMode: "AUTO" | "ORGANIZER_APPROVAL";
  visibility: "PUBLIC" | "PRIVATE";
  ageRestriction: number | null;
  rules: string | null;
  paymentUrl: string | null;
  additionalCategories?: { category: { id: string } }[];
}
interface Form {
  title: string;
  description: string;
  categoryId: string | null;
  additionalCategoryIds: string[];
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
  youtubeUrl: string;
  priceType: "FREE" | "PAID" | "DONATION";
  price: string;
  capacity: string;
  minParticipants: string;
  approvalMode: "AUTO" | "ORGANIZER_APPROVAL";
  visibility: "PUBLIC" | "PRIVATE";
  adultsOnly: boolean;
  rules: string;
  paymentUrl: string;
}

const RECURRENCE_TYPES = ["DAILY", "WEEKLY", "EVERY_N_WEEKS", "EVERY_N_MONTHS"] as const;
type RecurrenceType = (typeof RECURRENCE_TYPES)[number];

const MAX_ADDITIONAL_CATEGORIES = 5;
/** Buying credits directly is hidden for now — only the subscription is user-facing; flip this back on to restore it. */
const SHOW_BUY_CREDITS = false;
const GIFT_SHOWN_KEY = "kiro_create_gift_shown";
const STEPS = 3;
const pad = (n: number) => String(n).padStart(2, "0");
/** form.date stays ISO (YYYY-MM-DD) internally — only the text field shows/accepts DD.MM.YYYY,
 * the format Ukrainian users actually write dates in. Falls back to passthrough while the user
 * is mid-typing (neither shape matches yet), which is harmless since it's just local form state. */
function isoToDisplayDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : iso;
}
function displayToIsoDate(display: string): string {
  const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(display);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : display;
}
/** Auto-inserts the dots as the user types digits — typing "66092026" with no dots used to pass
 * straight through unvalidated (the regex above only matches an already-dotted string), silently
 * storing a garbage date that only surfaced as a generic error much later, at submit time. */
function formatEventDateInput(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 8);
  if (!digits) return "";
  let out = digits.slice(0, 2);
  if (digits.length > 2) out += `.${digits.slice(2, 4)}`;
  if (digits.length > 4) out += `.${digits.slice(4, 8)}`;
  return out;
}
/** Range-checks day/month and round-trips through Date to catch real calendar validity (Feb 30, day 66, etc). */
function isValidDisplayDate(display: string): boolean {
  const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(display);
  if (!m) return false;
  const day = Number(m[1]);
  const month = Number(m[2]);
  const year = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const d = new Date(year, month - 1, day);
  return d.getFullYear() === year && d.getMonth() === month - 1 && d.getDate() === day;
}
/** The backend rejects a URL with no protocol (`@IsUrl`) — most people just type "site.com" meaning
 * https, so fill that in for them instead of making them retype it after a confusing error. */
function normalizeUrl(raw: string): string | undefined {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}
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
  additionalCategoryIds: [],
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
  youtubeUrl: "",
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

/**
 * The create flow can take several minutes to fill in (photos, address lookup, several steps), long enough for the
 * short-lived access token to expire mid-flow — every request would then fail with "AUTH_REQUIRED" even though the
 * user never left the screen. On a 401 we silently refresh the session once and retry before giving up.
 */
async function authed<T = unknown>(path: string, init: RequestInit = {}, retried = false): Promise<T> {
  const token = getAccessToken();
  const isUpload = init.body instanceof FormData;
  let res: Response;
  try {
    res = await fetch(`${API_URL}/api/v1${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${token ?? ""}`, ...(init.body && !isUpload ? { "Content-Type": "application/json" } : {}), ...init.headers },
    });
  } catch (err) {
    const e = err instanceof Error ? err : new Error(String(err));
    void reportClientError(`Upload network failure: ${init.method ?? "GET"} ${path} — ${e.message}`, e.stack, isUpload ? "CreateEventFlow upload" : "CreateEventFlow authed");
    throw e;
  }
  if (res.status === 401 && !retried) {
    const refreshed = await refreshAccessToken();
    if (refreshed) return authed<T>(path, init, true);
  }
  const rawText = await res.text();
  const body = ((): unknown => { try { return JSON.parse(rawText); } catch { return null; } })();
  if (!res.ok) {
    if (isUpload || body === null) {
      void reportClientError(
        `Upload failed: ${init.method ?? "GET"} ${path} -> ${res.status}\n${rawText.slice(0, 1000)}`,
        undefined,
        "CreateEventFlow upload",
      );
    }
    throw new ApiRequestError(body as { error?: { code?: string; message?: string; details?: Record<string, string[]> } } | null);
  }
  return body as T;
}

/**
 * The backend's VALIDATION_ERROR on publish carries exactly which fields are missing
 * (`details._`) or, for a startsAt-in-the-past failure, a field-keyed message — the generic
 * "check your data" text otherwise shown leaves the organizer guessing which of the 5 wizard
 * steps to go back to.
 */
const FIELD_LABELS: Record<string, string> = {
  title: "events.wizard.title",
  categoryId: "events.wizard.category",
  startsAt: "create.date",
  description: "events.wizard.description",
  cityId: "events.wizard.city",
  onlineUrl: "events.wizard.onlineUrl",
  youtubeUrl: "events.wizard.youtubeUrl",
};

function describePublishError(err: ApiRequestError, t: (key: string) => string): string {
  const details = err.details as Record<string, string[]> | undefined;
  if (!details) return t(`errors.${err.code}`);

  if (Array.isArray(details._) && details._.length > 0) {
    const names = details._.map((field) => (FIELD_LABELS[field] ? t(FIELD_LABELS[field]) : field)).join(", ");
    return `${t("create.missingFields")}: ${names}`;
  }
  if (details.startsAt) return t("create.startsAtPast");

  // Any other field-keyed entry is a format/validity error (e.g. onlineUrl without a protocol) —
  // not a MISSING field, but still one the generic "check your input" text leaves unidentified.
  const invalidFields = Object.keys(details).filter((k) => k !== "_" && Array.isArray(details[k]) && details[k].length > 0);
  if (invalidFields.length > 0) {
    const names = invalidFields.map((field) => (FIELD_LABELS[field] ? t(FIELD_LABELS[field]) : field)).join(", ");
    return `${t("create.invalidFields")}: ${names}`;
  }

  return t(`errors.${err.code}`);
}

/** Spec §31/§68: title -> media -> category/when/where -> price/seats -> publish, with the draft autosaved on every step. */
export function CreateEventFlow({ editEventId }: { editEventId?: string } = {}) {
  const { colors, styles } = useThemedStyles(makeStyles);
  const { user, isLoading } = useAuth();
  const { t, locale } = useTranslations();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<Form>(INITIAL);
  const [eventId, setEventId] = useState<string | null>(null);
  const [slug, setSlug] = useState<string | null>(null);
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [categories, setCategories] = useState<Named[]>([]);
  const [additionalCategoriesEnabled, setAdditionalCategoriesEnabled] = useState(false);
  const [cities, setCities] = useState<Named[]>([]);
  const [districts, setDistricts] = useState<Named[]>([]);
  const [newDistrictName, setNewDistrictName] = useState("");
  const [addingDistrict, setAddingDistrict] = useState(false);
  const [districtAdded, setDistrictAdded] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [addingCategory, setAddingCategory] = useState(false);
  const [categoryAdded, setCategoryAdded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [giftOpen, setGiftOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  // Free-typed text, independent of form.date (ISO): only commits to form.date once it's a real
  // calendar date, so a mid-typo like "66.09.2026" shows as invalid instead of being silently
  // stored and only failing much later, at submit time, with no indication which field was wrong.
  const [dateText, setDateText] = useState(() => isoToDisplayDate(form.date));
  const dateTextInvalid = dateText.length === 10 && !isValidDisplayDate(dateText);
  // Keep in sync when form.date changes from elsewhere (quick-pick chips, the calendar picker, or
  // loading an existing event to edit) — never fires from the user's own typing, since that only
  // calls set({ date }) once the typed text is already a complete, valid date.
  useEffect(() => {
    setDateText(isoToDisplayDate(form.date));
  }, [form.date]);
  const [timePickerOpen, setTimePickerOpen] = useState(false);
  const [isPro, setIsPro] = useState<boolean | null>(null);
  const [recurring, setRecurring] = useState(false);
  const [recurrenceType, setRecurrenceType] = useState<RecurrenceType>("WEEKLY");
  const [recurrenceCount, setRecurrenceCount] = useState("");
  const [seriesCreated, setSeriesCreated] = useState(false);
  const [outcome, setOutcome] = useState<null | "PUBLISHED" | "PENDING_MODERATION" | "REJECTED">(null);
  const [publishedAlready, setPublishedAlready] = useState(false);
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

  // New event, nothing picked yet: default to the city used for the organizer's last event (one
  // less thing to type for a repeat organizer), falling back to Kyiv since that's where most of
  // the current audience is.
  useEffect(() => {
    if (editEventId) return;
    void (async () => {
      const mine = await authed<{ cityId: string | null }[]>("/events/mine").catch(() => null);
      const lastCityId = mine?.find((e) => e.cityId)?.cityId;
      if (lastCityId) {
        set({ cityId: lastCityId });
        return;
      }
      const cities = await fetch(`${API_URL}/api/v1/geography/cities`).then((r) => (r.ok ? r.json() : [])) as (Named & { slug?: string })[];
      const kyiv = cities.find((c) => c.slug === "kyiv");
      if (kyiv) set({ cityId: kyiv.id });
    })();
  }, [editEventId]);

  // Edit mode: load the organizer's event into the same form the wizard uses.
  useEffect(() => {
    if (!editEventId) return;
    void authed<EventDetail>(`/events/${editEventId}`)
      .then((e) => {
        const start = e.startsAt ? new Date(e.startsAt) : null;
        const end = e.endsAt ? new Date(e.endsAt) : null;
        const p2 = (n: number) => String(n).padStart(2, "0");
        setEventId(e.id);
        setSlug(e.slug);
        setPublishedAlready(e.status === "PUBLISHED");
        setMedia((e.media ?? []) as MediaItem[]);
        setAdditionalCategoriesEnabled((e.additionalCategories ?? []).length > 0);
        setForm({
          ...INITIAL,
          title: e.title,
          description: e.description ?? "",
          categoryId: e.categoryId ?? null,
          additionalCategoryIds: (e.additionalCategories ?? []).map((c) => c.category.id),
          format: e.format,
          date: start ? `${start.getFullYear()}-${p2(start.getMonth() + 1)}-${p2(start.getDate())}` : INITIAL.date,
          time: start ? `${p2(start.getHours())}:${p2(start.getMinutes())}` : INITIAL.time,
          duration: start && end ? String(Math.max(0.5, (end.getTime() - start.getTime()) / 3_600_000)) : INITIAL.duration,
          cityId: e.cityId ?? null,
          districtId: e.districtId ?? null,
          addressText: e.addressText ?? "",
          googlePlaceId: e.googlePlaceId ?? null,
          latitude: e.latitude != null ? Number(e.latitude) : null,
          longitude: e.longitude != null ? Number(e.longitude) : null,
          onlineUrl: e.onlineUrl ?? "",
          youtubeUrl: e.youtubeUrl ?? "",
          priceType: e.priceType,
          price: e.price ? String(Number(e.price)) : "",
          capacity: e.capacity?.toString() ?? "",
          minParticipants: e.minParticipants?.toString() ?? "",
          approvalMode: e.approvalMode,
          visibility: e.visibility,
          adultsOnly: (e.ageRestriction ?? 0) >= 18,
          rules: e.rules ?? "",
          paymentUrl: e.paymentUrl ?? "",
        });
      })
      .catch(() => setError(t("common.somethingWentWrong")));
  }, [editEventId, t]);

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

  // §37 — a district missing from the list gets suggested to the API; it stays PENDING (invisible
  // to other users) until an admin approves it, but selecting it here still attaches it to this event.
  async function addDistrict() {
    const nameUk = newDistrictName.trim();
    if (!nameUk || !form.cityId) return;
    setAddingDistrict(true);
    try {
      const created = await authed<Named>("/geography/districts", { method: "POST", body: JSON.stringify({ cityId: form.cityId, nameUk }) });
      setDistricts((d) => [...d, created]);
      set({ districtId: created.id });
      setNewDistrictName("");
      setDistrictAdded(true);
    } catch {
      setError(t("common.somethingWentWrong"));
    } finally {
      setAddingDistrict(false);
    }
  }

  // §16/§38 — a category missing from the list gets suggested to the API the same way a missing
  // district does: stays PENDING (invisible to other users) until an admin approves it, but is
  // attached to this event immediately.
  async function addCategory() {
    const nameUk = newCategoryName.trim();
    if (!nameUk) return;
    setAddingCategory(true);
    try {
      const created = await authed<Named>("/categories", { method: "POST", body: JSON.stringify({ nameUk }) });
      setCategories((c) => [...c, created]);
      set({ categoryId: created.id });
      setNewCategoryName("");
      setCategoryAdded(true);
    } catch {
      setError(t("common.somethingWentWrong"));
    } finally {
      setAddingCategory(false);
    }
  }

  const loadBalance = useCallback(async () => {
    try {
      const { balance: b } = await authed<{ balance: number }>("/credits/balance");
      setBalance(b);
      // First-ever visit with nothing claimed yet: a one-time welcome gift, not just the quiet
      // "claim free credits" button that was easy to miss at the bottom of the balance line.
      if (b === 0 && !editEventId) {
        const shown = await SecureStore.getItemAsync(GIFT_SHOWN_KEY).catch(() => null);
        if (!shown) setGiftOpen(true);
      }
    } catch {
      /* balance is informational */
    }
  }, [editEventId]);

  // Loaded once up front (not just on the last step) so the cost is visible from the very start,
  // not only as a surprise right before publishing.
  useEffect(() => {
    void loadBalance();
  }, [loadBalance]);

  // Recurring events are Pro-only (POST /events/:id/series -> 403 SUBSCRIPTION_REQUIRED otherwise).
  // Checked once up front so the toggle can be disabled before the user ever tries it, instead of
  // letting them fill it in and only finding out it's blocked when the step fails to save.
  useEffect(() => {
    authed<{ tier: "STARTER" | "PRO" | null; status: "ACTIVE" | "GRACE_PERIOD" | null }>("/platform-subscriptions/mine")
      .then((sub) => setIsPro(sub.tier === "PRO" && (sub.status === "ACTIVE" || sub.status === "GRACE_PERIOD")))
      .catch(() => setIsPro(false));
  }, []);

  function toggleRecurring() {
    if (isPro !== true) {
      Alert.alert(t("create.recurringRequiresPro"), undefined, [
        { text: t("common.cancel"), style: "cancel" },
        { text: t("pricing.switchTo"), onPress: () => router.push("/subscription") },
      ]);
      return;
    }
    setRecurring((v) => !v);
  }

  function dismissGift() {
    setGiftOpen(false);
    void SecureStore.setItemAsync(GIFT_SHOWN_KEY, "1").catch(() => {});
  }

  async function claimGift() {
    await claimFree();
    dismissGift();
  }

  const startsAt = () => {
    const d = new Date(`${form.date}T${form.time}:00`);
    return Number.isNaN(d.getTime()) ? null : d;
  };

  /** The PATCH body for whatever the current step has collected. */
  function payloadFor(currentStep: number): Record<string, unknown> {
    if (currentStep === 0) {
      const start = startsAt();
      const hours = Math.max(0.5, Number(form.duration) || 2);
      return {
        description: form.description.trim() || undefined,
        categoryId: form.categoryId ?? undefined,
        format: form.format,
        ...(publishedAlready ? { notifyParticipants: true } : {}),
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
          : { onlineUrl: normalizeUrl(form.onlineUrl) }),
      };
    }
    if (currentStep === 1) {
      return {
        youtubeUrl: normalizeUrl(form.youtubeUrl),
        priceType: form.priceType,
        price: form.priceType === "PAID" && form.price ? Number(form.price) : undefined,
        capacity: form.capacity ? Number(form.capacity) : undefined,
        minParticipants: form.minParticipants ? Number(form.minParticipants) : undefined,
        approvalMode: form.approvalMode,
        visibility: form.visibility,
        ageRestriction: form.adultsOnly ? 18 : 0,
        rules: form.rules.trim() || undefined,
        paymentUrl: form.priceType !== "FREE" && form.paymentUrl.trim() ? form.paymentUrl.trim() : undefined,
      };
    }
    return {};
  }

  async function saveDraft(currentStep: number) {
    if (currentStep === 0) {
      if (form.title.trim().length < 3) throw new Error(t("create.titleTooShort"));
      let id = eventId;
      if (!id) {
        const created = await authed<{ id: string; slug: string }>("/events", { method: "POST", body: JSON.stringify({ title: form.title.trim() }) });
        id = created.id;
        setEventId(created.id);
        setSlug(created.slug);
        const extra = payloadFor(0);
        if (Object.values(extra).some((v) => v !== undefined)) {
          const updated = await authed<{ slug: string }>(`/events/${created.id}`, { method: "PATCH", body: JSON.stringify(extra) });
          setSlug(updated.slug ?? created.slug);
        }
      } else {
        const updated = await authed<{ slug: string }>(`/events/${id}`, { method: "PATCH", body: JSON.stringify({ title: form.title.trim(), ...payloadFor(0) }) });
        setSlug(updated.slug ?? slug);
      }
      await authed(`/events/${id}/categories`, { method: "PUT", body: JSON.stringify({ categoryIds: form.additionalCategoryIds }) });
      return;
    }
    const body = payloadFor(currentStep);
    if (eventId && Object.values(body).some((v) => v !== undefined)) {
      await authed(`/events/${eventId}`, { method: "PATCH", body: JSON.stringify(body) });
    }

    // New events only — editing an already-recurring event is a bulk-occurrence operation that
    // belongs on the dedicated /series/:id screen (reachable from the event's "repeat" icon), not
    // this one-shot inline toggle.
    if (currentStep === 1 && recurring && !seriesCreated && eventId && !editEventId) {
      await authed(`/events/${eventId}/series`, {
        method: "POST",
        body: JSON.stringify({ recurrenceType, count: recurrenceCount ? Number(recurrenceCount) : undefined }),
      });
      setSeriesCreated(true);
    }
  }

  async function next() {
    setError(null);
    setBusy(true);
    try {
      await saveDraft(step);
      setStep((s) => Math.min(STEPS - 1, s + 1));
    } catch (err) {
      setError(err instanceof ApiRequestError ? describePublishError(err, t) : err instanceof Error ? err.message : t("common.somethingWentWrong"));
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
        // Expo SDK 57's global fetch only accepts a string, Blob, or Blob-like (.bytes()) FormData
        // part — the classic RN {uri, name, type} object throws "Unsupported FormDataPart
        // implementation" before the request is even sent. expo-file-system's File implements Blob.
        data.append("file", new File(asset.uri), asset.fileName ?? `upload.${mime.split("/")[1] ?? "jpg"}`);
        const uploaded = await authed<MediaItem>(`/events/${eventId}/media`, { method: "POST", body: data });
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
      setBalance((await authed<{ balance: number }>("/credits/claim-free", { method: "POST" })).balance);
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
      const published = await authed<{ slug: string; status: "PUBLISHED" | "PENDING_MODERATION" | "REJECTED" }>(`/events/${eventId}/publish`, {
        method: "POST",
      });
      setSlug(published.slug ?? slug);
      setOutcome(published.status);
    } catch (err) {
      setError(err instanceof ApiRequestError ? describePublishError(err, t) : t("common.somethingWentWrong"));
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
  const stepNames = [t("create.stepBasics"), t("create.stepDetails"), t("create.stepPreview")];
  const dateChips = [
    { value: addDays(0), label: t("create.today") },
    { value: addDays(1), label: t("create.tomorrow") },
    { value: nextWeekday(6), label: t("create.saturday") },
    { value: nextWeekday(0), label: t("create.sunday") },
  ];
  const durationChips = ["1", "2", "3", "4", "6"].map((h) => ({ value: h, label: `${h}` }));
  const timeSlots = Array.from({ length: 36 }, (_, i) => {
    const totalMinutes = 6 * 60 + i * 30; // 06:00 .. 23:30, half-hour steps
    return `${pad(Math.floor(totalMinutes / 60))}:${pad(totalMinutes % 60)}`;
  });
  const summaryCategory = categoryOptions.find((c) => c.id === form.categoryId)?.label;
  const start = startsAt();

  return (
    <>
    {/* Android needs an explicit "height" behavior (not the no-op `undefined`) to actually shrink
        available space when the keyboard opens — otherwise the Description/Rules fields end up
        hidden behind the keyboard with nothing to scroll them into view. */}
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : "height"}>
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
            {balance !== null && (
              <View style={styles.costBanner}>
                <Ionicons name="pricetag-outline" size={16} color={colors.accentFrom} />
                <Text style={styles.costBannerText}>
                  {t("events.wizard.publishCost")} · {t("events.wizard.creditsBalance")}: <Text style={{ fontWeight: "800" }}>{balance}</Text>
                </Text>
              </View>
            )}
            <Field label={t("events.wizard.title")} required>
              <TextInput value={form.title} onChangeText={(v) => set({ title: v })} placeholder={t("events.wizard.titlePlaceholder")} placeholderTextColor={colors.muted} style={styles.input} maxLength={120} />
            </Field>
            <Section title={t("events.wizard.category")}>
              <SearchPicker
                options={categoryOptions}
                selected={form.categoryId ? [form.categoryId] : []}
                multi={false}
                onChange={(ids) => set({ categoryId: ids[0] ?? null })}
                placeholder={t("events.wizard.categoryPlaceholder")}
                emptyLabel={t("filters.noResults")}
              />
              <Text style={styles.hint}>{categoryAdded ? t("events.wizard.addCategorySubmitted") : t("events.wizard.addCategory")}</Text>
              <View style={styles.addDistrictRow}>
                <TextInput
                  value={newCategoryName}
                  onChangeText={(v) => {
                    setNewCategoryName(v);
                    setCategoryAdded(false);
                  }}
                  placeholder={t("events.wizard.addCategoryPlaceholder")}
                  placeholderTextColor={colors.muted}
                  style={[styles.input, styles.addDistrictInput]}
                />
                <Pressable
                  onPress={() => void addCategory()}
                  disabled={!newCategoryName.trim() || addingCategory}
                  style={[styles.addDistrictButton, (!newCategoryName.trim() || addingCategory) && { opacity: 0.5 }]}
                >
                  {addingCategory ? <ActivityIndicator color={colors.white} size="small" /> : <Text style={styles.addDistrictButtonText}>{t("events.wizard.addDistrictAdd")}</Text>}
                </Pressable>
              </View>
            </Section>
            <Field label={t("events.wizard.description")} required>
              <TextInput value={form.description} onChangeText={(v) => set({ description: v })} placeholder={t("events.wizard.descriptionPlaceholder")} placeholderTextColor={colors.muted} style={[styles.input, styles.multiline]} multiline />
            </Field>
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
              <View style={styles.row}>
                <TextInput
                  value={dateText}
                  onChangeText={(v) => {
                    const masked = formatEventDateInput(v);
                    setDateText(masked);
                    if (isValidDisplayDate(masked)) set({ date: displayToIsoDate(masked) });
                  }}
                  placeholder={t("create.dateHint")}
                  placeholderTextColor={colors.muted}
                  style={[styles.input, { flex: 1 }, dateTextInvalid && styles.inputError]}
                  keyboardType="number-pad"
                  maxLength={10}
                />
                <Pressable style={styles.iconToggle} onPress={() => setDatePickerOpen((v) => !v)} accessibilityLabel={t("create.pickDate")}>
                  <Ionicons name="calendar-outline" size={20} color={colors.foreground} />
                </Pressable>
              </View>
              {dateTextInvalid && <Text style={styles.fieldError}>{t("create.invalidDate")}</Text>}
              {datePickerOpen && (
                <CalendarPicker
                  mode="date"
                  from={form.date}
                  to=""
                  locale={locale}
                  onChange={({ from }) => {
                    set({ date: from });
                    setDatePickerOpen(false);
                  }}
                />
              )}
            </Section>
            <Field label={t("create.time")}>
              <View style={styles.row}>
                <TextInput value={form.time} onChangeText={(v) => set({ time: v })} placeholder={t("create.timeHint")} placeholderTextColor={colors.muted} style={[styles.input, { flex: 1 }]} keyboardType="numbers-and-punctuation" maxLength={5} />
                <Pressable style={styles.iconToggle} onPress={() => setTimePickerOpen((v) => !v)} accessibilityLabel={t("create.pickTime")}>
                  <Ionicons name="time-outline" size={20} color={colors.foreground} />
                </Pressable>
              </View>
              {timePickerOpen && (
                <ScrollView style={styles.timeSlotList} nestedScrollEnabled keyboardShouldPersistTaps="handled">
                  {timeSlots.map((slot) => (
                    <Pressable
                      key={slot}
                      style={styles.timeSlotRow}
                      onPress={() => {
                        set({ time: slot });
                        setTimePickerOpen(false);
                      }}
                    >
                      <Text style={[styles.timeSlotText, slot === form.time && styles.timeSlotTextOn]}>{slot}</Text>
                      {slot === form.time && <Ionicons name="checkmark" size={18} color={colors.accentFrom} />}
                    </Pressable>
                  ))}
                </ScrollView>
              )}
            </Field>
            <Section title={t("create.duration")}>
              <Chips value={form.duration} options={durationChips} onChange={(v) => set({ duration: v })} />
            </Section>
            {form.format === "OFFLINE" ? (
              <>
                <Section title={`${t("events.wizard.city")} *`}>
                  <SearchPicker options={cityOptions} selected={form.cityId ? [form.cityId] : []} multi={false} onChange={(ids) => set({ cityId: ids[0] ?? null, districtId: null })} placeholder={t("filters.search")} emptyLabel={t("filters.noResults")} />
                </Section>
                {form.cityId && (
                  <Section title={`${t("events.wizard.district")} (${t("create.optional")})`}>
                    {districtOptions.length > 0 && (
                      <SearchPicker options={districtOptions} selected={form.districtId ? [form.districtId] : []} multi={false} onChange={(ids) => set({ districtId: ids[0] ?? null })} placeholder={t("filters.search")} emptyLabel={t("filters.noResults")} />
                    )}
                    <View style={styles.addDistrictRow}>
                      <TextInput
                        value={newDistrictName}
                        onChangeText={(v) => {
                          setNewDistrictName(v);
                          setDistrictAdded(false);
                        }}
                        placeholder={t("events.wizard.addDistrictPlaceholder")}
                        placeholderTextColor={colors.muted}
                        style={[styles.input, styles.addDistrictInput]}
                      />
                      <Pressable
                        onPress={() => void addDistrict()}
                        disabled={!newDistrictName.trim() || addingDistrict}
                        style={[styles.addDistrictButton, (!newDistrictName.trim() || addingDistrict) && { opacity: 0.5 }]}
                      >
                        {addingDistrict ? <ActivityIndicator color={colors.white} size="small" /> : <Text style={styles.addDistrictButtonText}>{t("events.wizard.addDistrictAdd")}</Text>}
                      </Pressable>
                    </View>
                    <Text style={styles.hint}>{districtAdded ? t("events.wizard.addDistrictSubmitted") : t("events.wizard.addDistrict")}</Text>
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
                    {/* Android renders a vector-icon glyph as text, with its own font metrics on top of
                        whatever includeFontPadding/textAlignVertical do — those two alone weren't enough
                        to center "×" in this 24x24 circle. Forcing lineHeight to match the icon's own
                        size collapses the glyph's line box onto its visual box instead. */}
                    <Ionicons
                      name="close"
                      size={16}
                      color={colors.white}
                      style={{ includeFontPadding: false, textAlignVertical: "center", lineHeight: 16 }}
                    />
                  </Pressable>
                </View>
              ))}
              {media.length < 10 && (
                <Pressable style={[styles.mediaCell, styles.mediaAdd]} onPress={() => void pickMedia()} disabled={busy}>
                  {busy ? (
                    <ActivityIndicator color={colors.accentFrom} />
                  ) : (
                    <Ionicons
                      name="add"
                      size={32}
                      color={colors.accentFrom}
                      style={{ includeFontPadding: false, textAlignVertical: "center", lineHeight: 32 }}
                    />
                  )}
                </Pressable>
              )}
            </View>
            <Text style={styles.hint}>{t("create.mediaFormatsHint")}</Text>

            <Field label={t("events.wizard.youtubeUrl")}>
              <TextInput
                value={form.youtubeUrl}
                onChangeText={(v) => set({ youtubeUrl: v })}
                placeholder="https://youtube.com/watch?v=..."
                placeholderTextColor={colors.muted}
                style={styles.input}
                autoCapitalize="none"
                keyboardType="url"
              />
            </Field>

            <Pressable style={styles.detailsToggle} onPress={() => setDetailsOpen((v) => !v)}>
              <Text style={styles.detailsToggleText}>{t("create.moreSettings")}</Text>
              <Ionicons name={detailsOpen ? "chevron-up" : "chevron-down"} size={18} color={colors.accentFrom} />
            </Pressable>

            {detailsOpen && (
              <>
                <Section title={t("events.wizard.additionalCategories")}>
                  <Pressable style={styles.checkboxRow} onPress={() => setAdditionalCategoriesEnabled((v) => !v)} accessibilityRole="checkbox" accessibilityState={{ checked: additionalCategoriesEnabled }}>
                    <Ionicons name={additionalCategoriesEnabled ? "checkbox" : "square-outline"} size={20} color={additionalCategoriesEnabled ? colors.accentFrom : colors.muted} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.checkboxLabel}>{t("events.wizard.additionalCategories")}</Text>
                      <Text style={styles.hint}>{t("events.wizard.additionalCategoriesHint")}</Text>
                    </View>
                  </Pressable>
                  {additionalCategoriesEnabled && (
                    <SearchPicker
                      options={categoryOptions.filter((o) => o.id !== form.categoryId)}
                      selected={form.additionalCategoryIds}
                      multi
                      onChange={(ids) => set({ additionalCategoryIds: ids.slice(0, MAX_ADDITIONAL_CATEGORIES) })}
                      placeholder={t("filters.search")}
                      emptyLabel={t("filters.noResults")}
                    />
                  )}
                </Section>

                <Section title={t("events.wizard.priceType")}>
                  <Chips
                    value={form.priceType}
                    options={[
                      { value: "FREE" as const, label: t("events.wizard.priceFree") },
                      { value: "PAID" as const, label: t("events.wizard.pricePaid") },
                      { value: "DONATION" as const, label: t("events.wizard.priceDonation") },
                    ]}
                    onChange={(v) => set({ priceType: v })}
                  />
                </Section>
                {form.priceType === "DONATION" && <Text style={styles.hint}>{t("events.wizard.donationHint")}</Text>}
                {form.priceType !== "FREE" && (
                  <>
                    {form.priceType === "PAID" && (
                      <Field label={t("events.wizard.priceAmount")}>
                        <TextInput value={form.price} onChangeText={(v) => set({ price: v.replace(/[^0-9.]/g, "") })} style={styles.input} keyboardType="decimal-pad" placeholder="350" placeholderTextColor={colors.muted} />
                      </Field>
                    )}
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

                {!editEventId && (
                  <Section title={t("organizerSeries.title")}>
                    <Pressable style={styles.checkboxRow} onPress={toggleRecurring} accessibilityRole="checkbox" accessibilityState={{ checked: recurring, disabled: isPro !== true }}>
                      <Ionicons name={recurring && isPro ? "checkbox" : "square-outline"} size={20} color={recurring && isPro ? colors.accentFrom : colors.muted} />
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.xs }}>
                          <Text style={[styles.checkboxLabel, isPro !== true && { color: colors.muted }]}>{t("create.makeRecurring")}</Text>
                          {isPro !== true && <Text style={styles.proBadge}>PRO</Text>}
                        </View>
                        <Text style={styles.hint}>{t("organizerSeries.description")}</Text>
                      </View>
                    </Pressable>
                    {recurring && isPro && (
                      <>
                        <Chips
                          value={recurrenceType}
                          options={RECURRENCE_TYPES.map((v) => ({ value: v, label: t(`organizerSeries.recurrenceTypeOptions.${v}`) }))}
                          onChange={setRecurrenceType}
                        />
                        <Field label={t("organizerSeries.count")}>
                          <TextInput value={recurrenceCount} onChangeText={setRecurrenceCount} keyboardType="number-pad" style={styles.input} placeholder="4" placeholderTextColor={colors.muted} />
                        </Field>
                      </>
                    )}
                  </Section>
                )}
              </>
            )}
          </>
        )}

        {step === 2 && (
          <>
            <Text style={styles.summaryTitle}>{t("create.summary")}</Text>
            <View style={styles.summary}>
              <Text style={styles.summaryHeading}>{form.title}</Text>
              {summaryCategory && <Text style={styles.summaryLine}>{summaryCategory}</Text>}
              {start && <Text style={styles.summaryLine}>{formatShortDateTime(start)}</Text>}
              <Text style={styles.summaryLine}>
                {form.format === "OFFLINE" ? [cityOptions.find((c) => c.id === form.cityId)?.label, form.addressText].filter(Boolean).join(", ") : form.onlineUrl}
              </Text>
              <Text style={styles.summaryLine}>{formatPriceLabel({ priceType: form.priceType, price: form.price || null, currency: "UAH" }, t)}</Text>
              <Text style={styles.summaryLine}>{media.length} {t("create.stepMedia").toLowerCase()}</Text>
            </View>
            {balance !== null && (
              <Text style={styles.summaryLine}>
                {t("events.wizard.publishCost")}
                {"  ·  "}
                {t("events.wizard.creditsBalance")}: <Text style={{ fontWeight: "800", color: colors.foreground }}>{balance}</Text>
              </Text>
            )}
            {balance === 0 && <Button title={t("events.wizard.claimFreeCredits")} variant="secondary" onPress={() => void claimFree()} loading={busy} />}
            {/* Buying credits is hidden for now — only the subscription is shown to users; the flow itself stays intact. */}
            {SHOW_BUY_CREDITS && balance === 0 && <Button title={t("credits.title")} variant="secondary" onPress={() => router.push("/credits")} />}
          </>
        )}

        {error && <Text style={styles.error}>{error}</Text>}

        <View style={styles.nav}>
          {step > 0 && <Button title={t("create.back")} variant="secondary" onPress={() => setStep((s) => s - 1)} style={{ flex: 1 }} />}
          {step < STEPS - 1 ? (
            <Button title={t("create.next")} onPress={() => void next()} loading={busy} style={{ flex: 2 }} />
          ) : publishedAlready ? (
            <Button title={t("common.save")} onPress={() => (slug ? router.replace(`/event/${slug}`) : router.back())} style={{ flex: 2 }} />
          ) : (
            <Button title={t("events.wizard.publish")} onPress={() => void publish()} loading={busy} style={{ flex: 2 }} />
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>

    <Modal visible={giftOpen} transparent animationType="fade" onRequestClose={dismissGift}>
      <View style={styles.giftBackdrop}>
        <View style={styles.giftCard}>
          <Text style={styles.giftEmoji}>🎁</Text>
          <Text style={styles.giftTitle}>{t("create.giftTitle")}</Text>
          <Text style={styles.giftBody}>{t("create.giftBody")}</Text>
          <Button title={t("events.wizard.claimFreeCredits")} onPress={() => void claimGift()} loading={busy} />
          <Pressable onPress={dismissGift} hitSlop={8}>
            <Text style={styles.giftDismiss}>{t("create.giftLater")}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
    </>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  const { colors, styles } = useThemedStyles(makeStyles);
  return (
    <View style={{ gap: 6 }}>
      <Text style={styles.label}>
        {label}
        {required && <Text style={{ color: colors.danger }}> *</Text>}
      </Text>
      {children}
    </View>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
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
  hint: { color: colors.muted, fontSize: 12 },
  costBanner: { flexDirection: "row", alignItems: "center", gap: spacing.xs, backgroundColor: colors.surface, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  giftBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", alignItems: "center", justifyContent: "center", padding: spacing.xl },
  giftCard: { backgroundColor: colors.background, borderRadius: radius.lg, padding: spacing.xl, gap: spacing.md, alignItems: "center", width: "100%" },
  giftEmoji: { fontSize: 48 },
  giftTitle: { color: colors.foreground, fontSize: 18, fontWeight: "800", textAlign: "center" },
  giftBody: { color: colors.muted, fontSize: 14, textAlign: "center" },
  giftDismiss: { color: colors.muted, fontSize: 13, marginTop: spacing.xs },
  costBannerText: { color: colors.foreground, fontSize: 12, flexShrink: 1 },
  checkboxRow: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
  detailsToggle: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.xs, paddingVertical: spacing.sm },
  detailsToggleText: { color: colors.accentFrom, fontSize: 14, fontWeight: "700" },
  checkboxLabel: { color: colors.foreground, fontSize: 14, fontWeight: "600" },
  iconToggle: { width: 44, height: 44, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
  timeSlotList: { maxHeight: 220, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, marginTop: spacing.sm },
  timeSlotRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.md, paddingVertical: 11 },
  timeSlotText: { color: colors.foreground, fontSize: 14 },
  timeSlotTextOn: { fontWeight: "700", color: colors.accentFrom },
  proBadge: { color: colors.accentFrom, fontSize: 10, fontWeight: "800", borderWidth: 1, borderColor: colors.accentFrom, borderRadius: radius.full, paddingHorizontal: 6, paddingVertical: 1 },
  addDistrictRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm },
  addDistrictInput: { flex: 1 },
  addDistrictButton: { backgroundColor: colors.accentFrom, borderRadius: radius.md, paddingHorizontal: spacing.lg, alignItems: "center", justifyContent: "center" },
  addDistrictButtonText: { color: colors.white, fontSize: 14, fontWeight: "700" },
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
  inputError: { borderColor: colors.danger },
  fieldError: { color: colors.danger, fontSize: 12 },
  nav: { flexDirection: "row", gap: spacing.md },
});
