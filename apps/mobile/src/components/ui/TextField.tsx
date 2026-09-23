import { StyleSheet, Text, TextInput, View, type KeyboardTypeOptions } from "react-native";
import { colors, radius, spacing } from "../../lib/theme";

interface TextFieldProps {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  secureTextEntry?: boolean;
  keyboardType?: KeyboardTypeOptions;
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
  multiline?: boolean;
  error?: string;
}

/** §102 — every input has a real associated label, same rule as the web TextField. */
export function TextField({
  label,
  value,
  onChangeText,
  placeholder,
  secureTextEntry,
  keyboardType,
  autoCapitalize = "sentences",
  multiline,
  error,
}: TextFieldProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        secureTextEntry={secureTextEntry}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        multiline={multiline}
        accessibilityLabel={label}
        style={[styles.input, multiline && styles.multiline]}
      />
      {error && <Text style={styles.error}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.xs },
  label: { color: colors.foreground, fontSize: 13, fontWeight: "500" },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    color: colors.foreground,
    backgroundColor: colors.surface,
    fontSize: 15,
  },
  multiline: { minHeight: 80, textAlignVertical: "top" },
  error: { color: colors.danger, fontSize: 12 },
});
