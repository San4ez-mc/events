import { useCallback, useEffect, useState } from "react";
import { useLocalSearchParams, router } from "expo-router";
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { API_URL, getAccessToken } from "../../src/lib/api-client";
import { useTranslations } from "../../src/lib/locale-context";
import { Button } from "../../src/components/ui/Button";
import { Chips } from "../../src/components/discover/FiltersSheet";
import { ScreenHeader } from "../../src/components/ui/ScreenHeader";
import { formatShortDate } from "../../src/lib/format";
import type { CreateSeriesResult, EventDetail, EventOccurrence } from "../../src/lib/event-types";
import { colors, radius, spacing } from "../../src/lib/theme";

const RECURRENCE_TYPES = ["DAILY", "EVERY_N_DAYS", "WEEKLY", "EVERY_N_WEEKS", "SPECIFIC_WEEKDAY", "SPECIFIC_DAY_OF_MONTH", "EVERY_N_MONTHS"] as const;
type RecurrenceType = (typeof RECURRENCE_TYPES)[number];

/** §29 — turn a draft/published event into a recurring series; each occurrence is its own independent event. Mirrors the web organizer series page. */
export default function EventSeriesScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslations();

  const [event, setEvent] = useState<EventDetail | null | undefined>(undefined);
  const [occurrences, setOccurrences] = useState<EventOccurrence[] | null>(null);

  const [recurrenceType, setRecurrenceType] = useState<RecurrenceType>("WEEKLY");
  const [interval, setIntervalStr] = useState("");
  const [count, setCount] = useState("");
  const [until, setUntil] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const [bulk, setBulk] = useState({ title: "", description: "", capacity: "", rules: "" });
  const [bulkNotice, setBulkNotice] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);

  const loadOccurrences = useCallback(async (seriesId: string) => {
    const token = getAccessToken();
    if (!token) return;
    const res = await fetch(`${API_URL}/api/v1/event-series/${seriesId}/occurrences`, { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) setOccurrences((await res.json()) as EventOccurrence[]);
  }, []);

  useEffect(() => {
    if (!id) return;
    (async () => {
      const token = getAccessToken();
      if (!token) {
        router.replace("/login");
        return;
      }
      const res = await fetch(`${API_URL}/api/v1/events/${id}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) {
        setEvent(null);
        return;
      }
      const body = (await res.json()) as EventDetail;
      setEvent(body);
      if (body.seriesId) void loadOccurrences(body.seriesId);
    })();
  }, [id, loadOccurrences]);

  async function createSeries() {
    const token = getAccessToken();
    if (!token || !event) return;
    setCreating(true);
    setCreateError(null);
    try {
      const res = await fetch(`${API_URL}/api/v1/events/${event.id}/series`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          recurrenceType,
          interval: interval ? Number(interval) : undefined,
          count: count ? Number(count) : undefined,
          until: until ? new Date(`${until}T00:00:00`).toISOString() : undefined,
        }),
      });
      if (!res.ok) {
        setCreateError(t("common.somethingWentWrong"));
        return;
      }
      const result = (await res.json()) as CreateSeriesResult;
      setOccurrences(result.occurrences);
      setEvent((prev) => (prev ? { ...prev, seriesId: result.series.id } : prev));
    } finally {
      setCreating(false);
    }
  }

  async function applyToSeries() {
    const token = getAccessToken();
    if (!token || !event?.seriesId) return;
    const body: Record<string, unknown> = {};
    if (bulk.title.trim()) body.title = bulk.title.trim();
    if (bulk.description.trim()) body.description = bulk.description.trim();
    if (bulk.capacity) body.capacity = Number(bulk.capacity);
    if (bulk.rules.trim()) body.rules = bulk.rules.trim();
    if (Object.keys(body).length === 0) return;
    setBulkBusy(true);
    try {
      const res = await fetch(`${API_URL}/api/v1/event-series/${event.seriesId}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        const { updated } = (await res.json()) as { updated: number };
        setBulkNotice(`${t("organizerSeries.applied")}: ${updated}`);
        setBulk({ title: "", description: "", capacity: "", rules: "" });
      } else {
        setBulkNotice(t("common.somethingWentWrong"));
      }
    } finally {
      setBulkBusy(false);
    }
  }

  async function endSeries() {
    const token = getAccessToken();
    if (!token || !event?.seriesId) return;
    setBulkBusy(true);
    try {
      const res = await fetch(`${API_URL}/api/v1/event-series/${event.seriesId}/upcoming-drafts`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const { deleted } = (await res.json()) as { deleted: number };
        setBulkNotice(`${t("organizerSeries.removed")}: ${deleted}`);
        await loadOccurrences(event.seriesId);
      }
    } finally {
      setBulkBusy(false);
    }
  }

  if (event === undefined) return <ActivityIndicator style={{ flex: 1 }} color={colors.accentFrom} />;
  if (event === null) return <Text style={styles.center}>{t("common.somethingWentWrong")}</Text>;

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : "height"}>
      <ScrollView style={styles.flex} contentContainerStyle={styles.content}>
        <ScreenHeader title={t("organizerSeries.title")} subtitle={t("organizerSeries.description")} icon="repeat" />

        {event.seriesId ? (
          <>
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>{t("organizerSeries.editAll")}</Text>
              <Text style={styles.hint}>{t("organizerSeries.editAllHint")}</Text>
              <TextInput value={bulk.title} onChangeText={(v) => setBulk((b) => ({ ...b, title: v }))} placeholder={t("events.wizard.title")} placeholderTextColor={colors.muted} style={styles.input} />
              <TextInput
                value={bulk.description}
                onChangeText={(v) => setBulk((b) => ({ ...b, description: v }))}
                placeholder={t("events.wizard.description")}
                placeholderTextColor={colors.muted}
                style={[styles.input, styles.multiline]}
                multiline
              />
              <TextInput
                value={bulk.capacity}
                onChangeText={(v) => setBulk((b) => ({ ...b, capacity: v }))}
                placeholder={t("events.wizard.capacity")}
                placeholderTextColor={colors.muted}
                style={styles.input}
                keyboardType="number-pad"
              />
              <TextInput value={bulk.rules} onChangeText={(v) => setBulk((b) => ({ ...b, rules: v }))} placeholder={t("events.wizard.rules")} placeholderTextColor={colors.muted} style={[styles.input, styles.multiline]} multiline />
              <Button title={t("organizerSeries.applyAll")} onPress={() => void applyToSeries()} loading={bulkBusy} variant="secondary" />
              <Button title={t("organizerSeries.endSeries")} onPress={() => void endSeries()} loading={bulkBusy} variant="danger" />
              {bulkNotice && <Text style={styles.notice}>{bulkNotice}</Text>}
            </View>

            <Text style={styles.sectionTitle}>{t("organizerSeries.occurrencesTitle")}</Text>
            <FlatList
              data={occurrences ?? []}
              keyExtractor={(o) => o.id}
              scrollEnabled={false}
              renderItem={({ item }) => (
                <View style={styles.occRow}>
                  <Text style={styles.occTitle} numberOfLines={1}>
                    {item.title}
                  </Text>
                  {item.startsAt && <Text style={styles.occDate}>{formatShortDate(item.startsAt)}</Text>}
                  <Text style={styles.occStatus}>{item.status}</Text>
                </View>
              )}
            />
          </>
        ) : !event.startsAt ? (
          <Text style={styles.notice}>{t("organizerSeries.needsStartDate")}</Text>
        ) : (
          <View style={styles.card}>
            <Text style={styles.label}>{t("organizerSeries.recurrenceType")}</Text>
            <Chips
              value={recurrenceType}
              options={RECURRENCE_TYPES.map((v) => ({ value: v, label: t(`organizerSeries.recurrenceTypeOptions.${v}`) }))}
              onChange={setRecurrenceType}
            />
            <Text style={styles.label}>{t("organizerSeries.interval")}</Text>
            <TextInput value={interval} onChangeText={setIntervalStr} keyboardType="number-pad" style={styles.input} placeholderTextColor={colors.muted} />
            <Text style={styles.label}>{t("organizerSeries.count")}</Text>
            <TextInput value={count} onChangeText={setCount} keyboardType="number-pad" style={styles.input} placeholderTextColor={colors.muted} />
            <Text style={styles.label}>{t("organizerSeries.until")}</Text>
            <TextInput value={until} onChangeText={setUntil} placeholder={t("create.dateHint")} placeholderTextColor={colors.muted} style={styles.input} keyboardType="numbers-and-punctuation" maxLength={10} />
            {createError && <Text style={styles.error}>{createError}</Text>}
            <Button title={t("organizerSeries.create")} onPress={() => void createSeries()} loading={creating} />
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, textAlign: "center", textAlignVertical: "center", color: colors.muted },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.sm },
  sectionTitle: { color: colors.foreground, fontSize: 16, fontWeight: "700" },
  label: { color: colors.foreground, fontSize: 13, fontWeight: "600", marginTop: spacing.xs },
  hint: { color: colors.muted, fontSize: 12 },
  notice: { color: colors.muted, fontSize: 13 },
  error: { color: colors.danger, fontSize: 13 },
  input: { backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, color: colors.foreground, paddingHorizontal: spacing.md, paddingVertical: 10, fontSize: 14 },
  multiline: { minHeight: 70, textAlignVertical: "top" },
  occRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border, paddingVertical: spacing.sm },
  occTitle: { color: colors.foreground, fontSize: 14, fontWeight: "600", flex: 1 },
  occDate: { color: colors.muted, fontSize: 12 },
  occStatus: { color: colors.accentFrom, fontSize: 11, fontWeight: "700" },
});
