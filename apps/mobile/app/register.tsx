import { useState } from "react";
import { Link, router } from "expo-router";
import { Linking, StyleSheet, Text, View } from "react-native";
import { API_URL } from "../src/lib/api-client";
import { useAuth, ApiRequestError } from "../src/lib/auth-context";
import { useTranslations } from "../src/lib/locale-context";
import { Button } from "../src/components/ui/Button";
import { TextField } from "../src/components/ui/TextField";
import { AuthBackdrop } from "../src/components/auth/AuthBackdrop";
import { GoogleSignInButton } from "../src/components/auth/GoogleSignInButton";
import { colors, spacing } from "../src/lib/theme";

export default function RegisterScreen() {
  const { register } = useAuth();
  const { t } = useTranslations();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [emailTaken, setEmailTaken] = useState(false);
  const [loading, setLoading] = useState(false);

  async function submit() {
    setError(null);
    setEmailTaken(false);
    setLoading(true);
    try {
      await register({ email: email.trim(), password, name: name.trim() || undefined });
      router.replace("/welcome");
    } catch (err) {
      setEmailTaken(err instanceof ApiRequestError && err.code === "EMAIL_ALREADY_REGISTERED");
      setError(err instanceof ApiRequestError ? t(`errors.${err.code}`) : t("common.somethingWentWrong"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthBackdrop>
      <Text style={styles.title}>{t("auth.register.title")}</Text>

      <View style={styles.form}>
        <TextField label={t("auth.register.name")} value={name} onChangeText={setName} />
        <TextField label={t("auth.login.email")} value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
        <TextField label={t("auth.login.password")} value={password} onChangeText={setPassword} secureTextEntry />

        {error && <Text style={styles.error}>{error}</Text>}
        {emailTaken && (
          <View style={styles.takenRow}>
            <Text style={styles.takenLink} onPress={() => router.replace("/login")}>
              {t("auth.register.signIn")}
            </Text>
            <Text style={styles.takenLink} onPress={() => void Linking.openURL(`${API_URL}/forgot-password`)}>
              {t("auth.login.forgotPassword")}
            </Text>
          </View>
        )}

        <Button title={t("auth.register.submit")} onPress={() => void submit()} loading={loading} disabled={!email || !password} />
      </View>

      <GoogleSignInButton onSuccess={() => router.replace("/welcome")} />

      <Link href="/login" style={styles.link}>
        <Text style={styles.linkText}>{t("auth.register.hasAccount")} {t("auth.register.signIn")}</Text>
      </Link>
    </AuthBackdrop>
  );
}

const styles = StyleSheet.create({
  title: { color: colors.foreground, fontSize: 30, fontWeight: "800", textAlign: "center" },
  form: { gap: spacing.md },
  error: { color: colors.danger, fontSize: 13, textAlign: "center" },
  takenRow: { flexDirection: "row", justifyContent: "center", gap: spacing.lg },
  takenLink: { color: colors.accentFrom, fontSize: 13, fontWeight: "700", textDecorationLine: "underline" },
  link: { alignSelf: "center" },
  linkText: { color: colors.accentFrom, fontSize: 14, fontWeight: "600" },
});
