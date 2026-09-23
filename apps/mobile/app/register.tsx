import { useState } from "react";
import { Link, router } from "expo-router";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { useAuth, ApiRequestError } from "../src/lib/auth-context";
import { useTranslations } from "../src/lib/locale-context";
import { Button } from "../src/components/ui/Button";
import { TextField } from "../src/components/ui/TextField";
import { colors, spacing } from "../src/lib/theme";

export default function RegisterScreen() {
  const { register } = useAuth();
  const { t } = useTranslations();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit() {
    setError(null);
    setLoading(true);
    try {
      await register({ email: email.trim(), password, name: name.trim() || undefined });
      router.replace("/");
    } catch (err) {
      setError(err instanceof ApiRequestError ? t(`errors.${err.code}`) : t("common.somethingWentWrong"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>{t("auth.register.title")}</Text>

        <View style={styles.form}>
          <TextField label={t("auth.register.name")} value={name} onChangeText={setName} />
          <TextField label={t("auth.login.email")} value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
          <TextField label={t("auth.login.password")} value={password} onChangeText={setPassword} secureTextEntry />

          {error && <Text style={styles.error}>{error}</Text>}

          <Button
            title={t("auth.register.submit")}
            onPress={() => void submit()}
            loading={loading}
            disabled={!email || !password}
          />
        </View>

        <Link href="/login" style={styles.link}>
          <Text style={styles.linkText}>{t("auth.register.hasAccount")}</Text>
        </Link>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  container: { flexGrow: 1, justifyContent: "center", padding: spacing.xl, gap: spacing.xl },
  title: { color: colors.foreground, fontSize: 28, fontWeight: "700", textAlign: "center" },
  form: { gap: spacing.md },
  error: { color: colors.danger, fontSize: 13, textAlign: "center" },
  link: { alignSelf: "center" },
  linkText: { color: colors.accentFrom, fontSize: 14 },
});
