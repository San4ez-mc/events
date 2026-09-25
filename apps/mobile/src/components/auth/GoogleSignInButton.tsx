import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Google from "expo-auth-session/providers/google";
import * as WebBrowser from "expo-web-browser";
import { ApiRequestError, useAuth } from "../../lib/auth-context";
import { useTranslations } from "../../lib/locale-context";
import { colors, radius, spacing } from "../../lib/theme";

WebBrowser.maybeCompleteAuthSession();

// Public OAuth client IDs (not secrets) — inlined at build time from eas.json / .env.
const WEB_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
const IOS_ID = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
const ANDROID_ID = process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID;

function GoogleButton({ onSuccess }: { onSuccess: () => void }) {
  const { loginWithGoogle } = useAuth();
  const { t } = useTranslations();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [request, response, promptAsync] = Google.useIdTokenAuthRequest({
    webClientId: WEB_ID,
    iosClientId: IOS_ID,
    androidClientId: ANDROID_ID,
  });

  useEffect(() => {
    if (response?.type !== "success") return;
    const idToken = response.params.id_token;
    if (!idToken) return;
    setBusy(true);
    setError(null);
    loginWithGoogle(idToken)
      .then(onSuccess)
      .catch((err) => setError(err instanceof ApiRequestError ? t(`errors.${err.code}`) : t("common.somethingWentWrong")))
      .finally(() => setBusy(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- react to the auth response only
  }, [response]);

  return (
    <View style={styles.wrap}>
      <View style={styles.divider}>
        <View style={styles.line} />
        <Text style={styles.or}>{t("auth.orContinueWith")}</Text>
        <View style={styles.line} />
      </View>
      <Pressable style={({ pressed }) => [styles.button, pressed && { opacity: 0.85 }]} disabled={!request || busy} onPress={() => void promptAsync()}>
        {busy ? <ActivityIndicator color={colors.foreground} /> : <Ionicons name="logo-google" size={20} color={colors.foreground} />}
        <Text style={styles.text}>{t("auth.continueWithGoogle")}</Text>
      </Pressable>
      {error && <Text style={styles.error}>{error}</Text>}
    </View>
  );
}

/** §9 — Google sign-in. Renders nothing when no client ID was configured at build time. */
export function GoogleSignInButton({ onSuccess }: { onSuccess: () => void }) {
  if (!WEB_ID && !IOS_ID && !ANDROID_ID) return null;
  return <GoogleButton onSuccess={onSuccess} />;
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.md },
  divider: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  line: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  or: { color: colors.muted, fontSize: 12 },
  button: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, minHeight: 48, borderRadius: radius.full, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  text: { color: colors.foreground, fontSize: 15, fontWeight: "700" },
  error: { color: colors.danger, fontSize: 13, textAlign: "center" },
});
