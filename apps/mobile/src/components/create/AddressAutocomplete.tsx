import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { API_URL, getAccessToken } from "../../lib/api-client";
import { useTranslations } from "../../lib/locale-context";
import { colors, radius, spacing } from "../../lib/theme";

interface Suggestion {
  placeId: string;
  primary: string;
  secondary: string | null;
  description: string;
}

export interface PickedPlace {
  addressText: string;
  googlePlaceId: string | null;
  latitude: number | null;
  longitude: number | null;
}

const token = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;

/** §12/§60 — Google Places autocomplete through our API. Free text still works; a picked suggestion also stores place ID + coordinates. */
export function AddressAutocomplete({ value, onPick, placeholder }: { value: string; onPick: (place: PickedPlace) => void; placeholder: string }) {
  const { t, locale } = useTranslations();
  const [query, setQuery] = useState(value);
  const [items, setItems] = useState<Suggestion[]>([]);
  const [unavailable, setUnavailable] = useState(false);
  const session = useRef(token());
  const skip = useRef(false);

  useEffect(() => {
    if (skip.current) {
      skip.current = false;
      return;
    }
    const q = query.trim();
    if (q.length < 3) {
      setItems([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`${API_URL}/api/v1/places/autocomplete?q=${encodeURIComponent(q)}&sessionToken=${session.current}&locale=${locale}`, {
          headers: { Authorization: `Bearer ${getAccessToken() ?? ""}` },
        });
        if (!res.ok) {
          setUnavailable(true);
          setItems([]);
          return;
        }
        setUnavailable(false);
        setItems((await res.json()) as Suggestion[]);
      } catch {
        setUnavailable(true);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [query, locale]);

  async function pick(s: Suggestion) {
    setItems([]);
    skip.current = true;
    setQuery(s.description);
    try {
      const res = await fetch(`${API_URL}/api/v1/places/${encodeURIComponent(s.placeId)}?sessionToken=${session.current}&locale=${locale}`, {
        headers: { Authorization: `Bearer ${getAccessToken() ?? ""}` },
      });
      session.current = token();
      if (res.ok) {
        const d = (await res.json()) as { placeId: string; formattedAddress: string; latitude: number; longitude: number };
        skip.current = true;
        setQuery(d.formattedAddress);
        onPick({ addressText: d.formattedAddress, googlePlaceId: d.placeId, latitude: d.latitude, longitude: d.longitude });
        return;
      }
    } catch {
      /* fall back to the text-only result below */
    }
    onPick({ addressText: s.description, googlePlaceId: s.placeId, latitude: null, longitude: null });
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.inputRow}>
        <Ionicons name="location-outline" size={18} color={colors.muted} />
        <TextInput
          value={query}
          onChangeText={(v) => {
            setQuery(v);
            onPick({ addressText: v, googlePlaceId: null, latitude: null, longitude: null });
          }}
          placeholder={placeholder}
          placeholderTextColor={colors.muted}
          style={styles.input}
        />
      </View>
      {items.length > 0 && (
        <View style={styles.list}>
          {items.map((s) => (
            <Pressable key={s.placeId} onPress={() => void pick(s)} style={styles.row}>
              <Text style={styles.primary}>{s.primary}</Text>
              {s.secondary && <Text style={styles.secondary}>{s.secondary}</Text>}
            </Pressable>
          ))}
        </View>
      )}
      {unavailable && <Text style={styles.secondary}>{t("errors.PLACES_UNAVAILABLE")}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  inputRow: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.md },
  input: { flex: 1, color: colors.foreground, paddingVertical: 12, fontSize: 15 },
  list: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, overflow: "hidden", backgroundColor: colors.surface },
  row: { paddingHorizontal: spacing.md, paddingVertical: 10, gap: 2 },
  primary: { color: colors.foreground, fontSize: 14, fontWeight: "600" },
  secondary: { color: colors.muted, fontSize: 12 },
});
