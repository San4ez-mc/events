import { useCallback, useEffect, useState } from "react";
import { useLocalSearchParams, router } from "expo-router";
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { API_URL, getAccessToken } from "../../src/lib/api-client";
import { useAuth } from "../../src/lib/auth-context";
import { useTranslations } from "../../src/lib/locale-context";
import { Button } from "../../src/components/ui/Button";
import { ScreenHeader } from "../../src/components/ui/ScreenHeader";
import type { Collaborator } from "../../src/lib/event-types";
import { radius, spacing, type Palette, useThemedStyles } from "../../src/lib/theme";

const ALL_PERMISSIONS = ["EDIT_EVENT", "MANAGE_REGISTRATIONS", "MANAGE_PAYMENTS", "SEND_NOTIFICATIONS", "MANAGE_CHAT", "INVITE_PREVIOUS_PARTICIPANTS", "VIEW_ANALYTICS"] as const;
type Permission = (typeof ALL_PERMISSIONS)[number];

function PermissionChip({ label, on, onToggle, disabled }: { label: string; on: boolean; onToggle: () => void; disabled?: boolean }) {
  const { colors, styles } = useThemedStyles(makeStyles);
  return (
    <Pressable onPress={onToggle} disabled={disabled} style={[styles.permChip, on && styles.permChipOn]} accessibilityRole="checkbox" accessibilityState={{ checked: on }}>
      <Ionicons name={on ? "checkbox" : "square-outline"} size={15} color={on ? colors.accentFrom : colors.muted} />
      <Text style={[styles.permChipText, on && styles.permChipTextOn]}>{label}</Text>
    </Pressable>
  );
}

/** §30 — owner-only co-organizer management (add/update/remove, granular permissions). Mirrors the web organizer collaborators page. */
export default function CollaboratorsScreen() {
  const { colors, styles } = useThemedStyles(makeStyles);
  const { id } = useLocalSearchParams<{ id: string }>();
  const { isLoading: authLoading } = useAuth();
  const { t } = useTranslations();

  const [items, setItems] = useState<Collaborator[] | null>(null);
  const [error, setError] = useState(false);
  const [newUserId, setNewUserId] = useState("");
  const [newPermissions, setNewPermissions] = useState<Permission[]>([]);
  const [addError, setAddError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const token = getAccessToken();
    if (!token) return;
    const res = await fetch(`${API_URL}/api/v1/events/${id}/collaborators`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) {
      setError(true);
      return;
    }
    setItems((await res.json()) as Collaborator[]);
  }, [id]);

  useEffect(() => {
    if (authLoading || !id) return;
    const token = getAccessToken();
    if (!token) {
      router.replace("/login");
      return;
    }
    void load();
  }, [authLoading, id, load]);

  function toggle(list: Permission[], permission: Permission, set: (next: Permission[]) => void) {
    set(list.includes(permission) ? list.filter((p) => p !== permission) : [...list, permission]);
  }

  async function addCollaborator() {
    const token = getAccessToken();
    if (!token || !newUserId.trim() || newPermissions.length === 0) return;
    setAddError(null);
    setAdding(true);
    try {
      const res = await fetch(`${API_URL}/api/v1/events/${id}/collaborators`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ userId: newUserId.trim(), permissions: newPermissions }),
      });
      if (!res.ok) {
        setAddError(t("common.somethingWentWrong"));
        return;
      }
      const created = (await res.json()) as Collaborator;
      setItems((prev) => [...(prev ?? []).filter((c) => c.id !== created.id), created]);
      setNewUserId("");
      setNewPermissions([]);
    } finally {
      setAdding(false);
    }
  }

  async function updatePermissions(collaboratorId: string, permissions: Permission[]) {
    const token = getAccessToken();
    if (!token) return;
    setBusyId(collaboratorId);
    try {
      const res = await fetch(`${API_URL}/api/v1/events/${id}/collaborators/${collaboratorId}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ permissions }),
      });
      if (res.ok) {
        const updated = (await res.json()) as Collaborator;
        setItems((prev) => (prev ? prev.map((c) => (c.id === collaboratorId ? updated : c)) : prev));
      }
    } finally {
      setBusyId(null);
    }
  }

  async function remove(collaboratorId: string) {
    const token = getAccessToken();
    if (!token) return;
    setBusyId(collaboratorId);
    try {
      const res = await fetch(`${API_URL}/api/v1/events/${id}/collaborators/${collaboratorId}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) setItems((prev) => (prev ? prev.filter((c) => c.id !== collaboratorId) : prev));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : "height"}>
      <ScrollView style={styles.flex} contentContainerStyle={styles.content}>
        <ScreenHeader title={t("organizerCollaborators.title")} icon="people-circle" />

        {error && <Text style={styles.error}>{t("common.somethingWentWrong")}</Text>}
        {!error && items === null && <ActivityIndicator color={colors.accentFrom} />}

        {!error && items !== null && (
          <>
            {items.length === 0 && <Text style={styles.hint}>{t("organizerCollaborators.empty")}</Text>}

            <FlatList
              data={items}
              keyExtractor={(c) => c.id}
              scrollEnabled={false}
              renderItem={({ item }) => (
                <View style={styles.card}>
                  <View style={styles.cardHeader}>
                    <Text style={styles.cardName} numberOfLines={1}>
                      {item.user.name ?? item.user.nickname ?? item.user.email}
                    </Text>
                    <Button title={t("organizerCollaborators.remove")} variant="secondary" loading={busyId === item.id} onPress={() => void remove(item.id)} />
                  </View>
                  <View style={styles.permRow}>
                    {ALL_PERMISSIONS.map((p) => (
                      <PermissionChip
                        key={p}
                        label={t(`organizerCollaborators.permission.${p}`)}
                        on={item.permissions.includes(p)}
                        disabled={busyId === item.id}
                        onToggle={() => {
                          const next = item.permissions.includes(p) ? item.permissions.filter((x) => x !== p) : [...item.permissions, p];
                          if (next.length > 0) void updatePermissions(item.id, next);
                        }}
                      />
                    ))}
                  </View>
                </View>
              )}
            />

            <View style={[styles.card, styles.addCard]}>
              <Text style={styles.cardName}>{t("organizerCollaborators.addTitle")}</Text>
              <Text style={styles.label}>{t("organizerCollaborators.userId")}</Text>
              <TextInput value={newUserId} onChangeText={setNewUserId} placeholder={t("organizerCollaborators.userIdPlaceholder")} placeholderTextColor={colors.muted} style={styles.input} autoCapitalize="none" />
              <Text style={styles.label}>{t("organizerCollaborators.permissions")}</Text>
              <View style={styles.permRow}>
                {ALL_PERMISSIONS.map((p) => (
                  <PermissionChip key={p} label={t(`organizerCollaborators.permission.${p}`)} on={newPermissions.includes(p)} onToggle={() => toggle(newPermissions, p, setNewPermissions)} />
                ))}
              </View>
              {addError && <Text style={styles.error}>{addError}</Text>}
              <Button title={t("organizerCollaborators.add")} onPress={() => void addCollaborator()} loading={adding} disabled={!newUserId.trim() || newPermissions.length === 0} />
            </View>
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md },
  hint: { color: colors.muted, fontSize: 13 },
  error: { color: colors.danger, fontSize: 13 },
  label: { color: colors.foreground, fontSize: 13, fontWeight: "600", marginTop: spacing.xs },
  input: { backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, color: colors.foreground, paddingHorizontal: spacing.md, paddingVertical: 10, fontSize: 14 },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.sm, marginBottom: spacing.sm },
  addCard: { borderWidth: 1, borderColor: colors.border, borderStyle: "dashed" },
  cardHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
  cardName: { color: colors.foreground, fontSize: 15, fontWeight: "700", flex: 1 },
  permRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  permChip: { flexDirection: "row", alignItems: "center", gap: 4, borderWidth: 1, borderColor: colors.border, borderRadius: radius.full, paddingHorizontal: 10, paddingVertical: 5 },
  permChipOn: { borderColor: colors.accentFrom },
  permChipText: { color: colors.muted, fontSize: 11 },
  permChipTextOn: { color: colors.foreground },
});
