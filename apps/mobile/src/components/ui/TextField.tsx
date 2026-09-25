import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View, type KeyboardTypeOptions } from "react-native";
import { Ionicons } from "@expo/vector-icons";
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
  const [hidden, setHidden] = useState(true);
  const isPassword = !!secureTextEntry;
  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      <View>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        secureTextEntry={isPassword && hidden}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        multiline={multiline}
        accessibilityLabel={label}
        style={[styles.input, multiline && styles.multiline, isPassword && { paddingRight: 44 }]}
      />
        {isPassword && (
          <Pressable onPress={() => setHidden((h) => !h)} hitSlop={8} style={styles.eye} accessibilityLabel={hidden ? "Show password" : "Hide password"}>
            <Ionicons name={hidden ? "eye-outline" : "eye-off-outline"} size={20} color={colors.muted} />
          </Pressable>
        )}
      </View>
      {error && <Text style={styles.error}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  eye: { position: "absolute", right: 0, top: 0, bottom: 0, width: 44, alignItems: "center", justifyContent: "center" },
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
