import { Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import type { RegistrationState } from "@kiro/types";
import { Button } from "../ui/Button";
import { useTranslations } from "../../lib/locale-context";
import { formatShortDateTime } from "../../lib/format";
import { radius, spacing, type Palette, useThemedStyles } from "../../lib/theme";

type IconName = React.ComponentProps<typeof Ionicons>["name"];

/**
 * What to tell someone after they register, for every kind of event and every status (see describeRegistration):
 * open vs. approval-only, free vs. paid, online vs. in person, waitlist, rejection... plus the next steps for each.
 */
export function RegistrationStatusCard({
  state,
  eventId,
  startsAt,
  addressText,
  onlineUrl,
  mapsUrl,
  paymentUrl,
  submitting,
  onCancel,
  onMarkPaid,
  onCalendar,
}: {
  state: RegistrationState;
  eventId: string;
  startsAt: string | null;
  addressText: string | null;
  onlineUrl: string | null;
  mapsUrl: string | null;
  paymentUrl: string | null;
  submitting: boolean;
  onCancel: () => void;
  onMarkPaid: () => void;
  onCalendar: () => void;
}) {
  const { colors, styles } = useThemedStyles(makeStyles);
  const { t } = useTranslations();
  const key = (suffix: string) => `registration.state.${state.id}.${suffix}`;
  const tone: Record<RegistrationState["tone"], { icon: IconName; color: string }> = {
    success: { icon: "checkmark-circle", color: colors.success },
    info: { icon: state.id === "pending" || state.id === "pendingPaid" ? "information-circle" : "time", color: colors.accentFrom },
    warn: { icon: "warning", color: "#f59e0b" },
    error: { icon: "close-circle", color: colors.danger },
  };
  const { icon, color } = tone[state.tone];

  return (
    <View style={{ gap: spacing.md }}>
      <View style={[styles.banner, { borderColor: color }]}>
        <Ionicons name={icon} size={26} color={color} />
        <View style={{ flex: 1, gap: 6 }}>
          <Text style={styles.title}>{t(key("title"))}</Text>
          <Text style={styles.body}>{t(key("body1"))}</Text>
          {state.bodyCount === 2 && <Text style={styles.muted}>{t(key("body2"))}</Text>}
        </View>
      </View>

      {state.showWhenWhere && (
        <View style={styles.detail}>
          {startsAt && (
            <Text style={styles.body}>
              <Text style={styles.bold}>{t("registration.state.when")}: </Text>
              {formatShortDateTime(startsAt)}
            </Text>
          )}
          {state.showJoinLink && onlineUrl ? (
            <Pressable onPress={() => void Linking.openURL(onlineUrl)}>
              <Text style={[styles.body, { color: colors.accentFrom, textDecorationLine: "underline" }]}>{t("events.location.joinOnline")}</Text>
            </Pressable>
          ) : addressText ? (
            <Text style={styles.body}>
              <Text style={styles.bold}>{t("registration.state.where")}: </Text>
              {addressText}
            </Text>
          ) : null}
        </View>
      )}

      {state.showPayment && (
        <View style={{ gap: spacing.sm }}>
          {paymentUrl ? <Button title={t("registration.state.payNow")} variant="secondary" onPress={() => void Linking.openURL(paymentUrl)} /> : <Text style={styles.muted}>{t("registration.state.noPayLink")}</Text>}
          <Button title={t("registration.state.markPaid")} onPress={onMarkPaid} loading={submitting} />
        </View>
      )}

      {state.showReminders && <Text style={styles.small}>{t("registration.state.reminders")}</Text>}

      <View style={styles.actions}>
        {state.showCalendar && (
          <Pressable style={styles.chip} onPress={onCalendar}>
            <Ionicons name="calendar-outline" size={16} color={colors.foreground} />
            <Text style={styles.chipText}>{t("events.actions.addToCalendar")}</Text>
          </Pressable>
        )}
        {state.showRoute && mapsUrl && (
          <Pressable style={styles.chip} onPress={() => void Linking.openURL(mapsUrl)}>
            <Ionicons name="navigate-outline" size={16} color={colors.foreground} />
            <Text style={styles.chipText}>{t("events.location.route")}</Text>
          </Pressable>
        )}
        {state.canContact && (
          <Pressable style={styles.chip} onPress={() => router.push(`/inbox/event/${eventId}`)}>
            <Ionicons name="chatbubble-ellipses-outline" size={16} color={colors.foreground} />
            <Text style={styles.chipText}>{t("registration.state.contact")}</Text>
          </Pressable>
        )}
        {state.showOtherEvents && (
          <Pressable style={styles.chip} onPress={() => router.push("/")}>
            <Ionicons name="compass-outline" size={16} color={colors.foreground} />
            <Text style={styles.chipText}>{t("registration.state.otherEvents")}</Text>
          </Pressable>
        )}
      </View>

      {state.canCancel && <Button title={t("registration.cancelRegistration")} variant="secondary" onPress={onCancel} loading={submitting} />}
    </View>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    banner: { flexDirection: "row", gap: spacing.md, borderWidth: 1, borderRadius: radius.lg, backgroundColor: colors.surface, padding: spacing.md },
    title: { color: colors.foreground, fontSize: 17, fontWeight: "800" },
    body: { color: colors.foreground, fontSize: 14, lineHeight: 20 },
    muted: { color: colors.muted, fontSize: 14, lineHeight: 20 },
    small: { color: colors.muted, fontSize: 12 },
    bold: { fontWeight: "700" },
    detail: { gap: 4, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.md },
    actions: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
    chip: { flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderColor: colors.border, borderRadius: radius.full, paddingHorizontal: 14, paddingVertical: 9 },
    chipText: { color: colors.foreground, fontSize: 14, fontWeight: "600" },
  });
