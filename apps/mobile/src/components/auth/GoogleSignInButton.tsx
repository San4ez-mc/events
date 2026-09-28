import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as AuthSession from "expo-auth-session";
import * as Google from "expo-auth-session/providers/google";
import * as WebBrowser from "expo-web-browser";
import { API_URL } from "../../lib/api-client";
import { ApiRequestError, useAuth } from "../../lib/auth-context";
import { useTranslations } from "../../lib/locale-context";
import { radius, spacing, type Palette, useThemedStyles } from "../../lib/theme";

WebBrowser.maybeCompleteAuthSession();

// Public OAuth client IDs (not secrets) — inlined at build time from eas.json / .env.
const WEB_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
const IOS_ID = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
const ANDROID_ID = process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID;

function GoogleButton({ onSuccess }: { onSuccess: () => void }) {
  const { colors, styles } = useThemedStyles(makeStyles);
  const { loginWithGoogle } = useAuth();
  const { t } = useTranslations();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [request, response, promptAsync] = Google.useIdTokenAuthRequest({
    webClientId: WEB_ID,
    iosClientId: IOS_ID,
    androidClientId: ANDROID_ID,
    // We exchange the code ourselves so a failure is shown on screen instead of vanishing inside the library.
    shouldAutoExchangeCode: false,
  });

  useEffect(() => {
    if (!response) return;
    if (response.type === "error") {
      setError(`Google: ${response.error?.message ?? String(response.params?.error_description ?? response.params?.error ?? "error")}`);
      return;
    }
    if (response.type !== "success") return; // dismissed / cancelled by the user
    let cancelled = false;
    (async () => {
      setBusy(true);
      setError(null);
      try {
        let idToken: string | undefined = response.params.id_token;
        if (!idToken && response.params.code && request) {
          // Native Google clients return an authorization code (PKCE): trade it for tokens, no client secret needed.
          const tokens = await AuthSession.exchangeCodeAsync(
            { clientId: request.clientId, code: response.params.code, redirectUri: request.redirectUri, extraParams: { code_verifier: request.codeVerifier ?? "" } },
            Google.discovery,
          );
          idToken = tokens.idToken ?? undefined;
        }
        if (!idToken) throw new Error("Google did not return an id_token");
        await loginWithGoogle(idToken);
        if (!cancelled) onSuccess();
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof ApiRequestError ? t(`errors.${err.code}`) : `Google: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
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
  const [enabled, setEnabled] = useState(true);
  // §95 — the SOCIAL_LOGIN flag can switch Google sign-in off without a release.
  useEffect(() => {
    fetch(`${API_URL}/api/v1/config/flags`)
      .then((r) => (r.ok ? r.json() : null))
      .then((flags) => flags && setEnabled(flags.SOCIAL_LOGIN !== false))
      .catch(() => {});
  }, []);
  if (!enabled || (!WEB_ID && !IOS_ID && !ANDROID_ID)) return null;
  return <GoogleButton onSuccess={onSuccess} />;
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  wrap: { gap: spacing.md },
  divider: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  line: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  or: { color: colors.muted, fontSize: 12 },
  button: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, minHeight: 48, borderRadius: radius.full, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  text: { color: colors.foreground, fontSize: 15, fontWeight: "700" },
  error: { color: colors.danger, fontSize: 13, textAlign: "center" },
});
