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

export default function LoginScreen() {
  const { login } = useAuth();
  const { t } = useTranslations();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit() {
    setError(null);
    setLoading(true);
    try {
      await login(email.trim(), password);
      router.replace("/");
    } catch (err) {
      setError(err instanceof ApiRequestError ? t(`errors.${err.code}`) : t("common.somethingWentWrong"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthBackdrop>
      <Text style={styles.title}>{t("auth.login.title")}</Text>

      <View style={styles.form}>
        <TextField label={t("auth.login.email")} value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
        <TextField label={t("auth.login.password")} value={password} onChangeText={setPassword} secureTextEntry />

        {error && <Text style={styles.error}>{error}</Text>}

        <Button title={t("auth.login.submit")} onPress={() => void submit()} loading={loading} disabled={!email || !password} />
        <Text style={styles.forgot} onPress={() => void Linking.openURL(`${API_URL}/forgot-password`)}>
          {t("auth.login.forgotPassword")}
        </Text>
      </View>

      <GoogleSignInButton onSuccess={() => router.replace("/")} />

      <Link href="/register" style={styles.link}>
        <Text style={styles.linkText}>{t("auth.login.noAccount")} {t("auth.login.signUp")}</Text>
      </Link>
    </AuthBackdrop>
  );
}

const styles = StyleSheet.create({
  title: { color: colors.foreground, fontSize: 30, fontWeight: "800", textAlign: "center" },
  form: { gap: spacing.md },
  error: { color: colors.danger, fontSize: 13, textAlign: "center" },
  forgot: { color: colors.muted, fontSize: 13, textAlign: "center", textDecorationLine: "underline" },
  link: { alignSelf: "center" },
  linkText: { color: colors.accentFrom, fontSize: 14, fontWeight: "600" },
});
