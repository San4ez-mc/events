import { Pressable, StyleSheet, Switch, Text, View } from "react-native";
import { TextField } from "../ui/TextField";
import { colors, radius, spacing } from "../../lib/theme";

interface RegistrationField {
  id: string;
  label: string;
  type: string;
  required: boolean;
  optionsJson: string[] | null;
}

/** UX §14 — one input per organizer-defined custom question, mirroring the web RegistrationFieldInput's type handling. */
export function RegistrationFieldInput({
  field,
  value,
  onChange,
}: {
  field: RegistrationField;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  const options = field.optionsJson ?? [];
  const label = field.required ? `${field.label} *` : field.label;

  if (field.type === "TEXTAREA") {
    return <TextField label={label} value={typeof value === "string" ? value : ""} onChangeText={onChange} multiline />;
  }

  if (field.type === "TEXT" || field.type === "PHONE" || field.type === "EMAIL" || field.type === "DATE") {
    return (
      <TextField
        label={label}
        value={typeof value === "string" ? value : ""}
        onChangeText={onChange}
        keyboardType={field.type === "PHONE" ? "phone-pad" : field.type === "EMAIL" ? "email-address" : "default"}
        autoCapitalize="none"
        placeholder={field.type === "DATE" ? "YYYY-MM-DD" : undefined}
      />
    );
  }

  if (field.type === "NUMBER") {
    return (
      <TextField
        label={label}
        value={typeof value === "number" || typeof value === "string" ? String(value) : ""}
        onChangeText={(v) => onChange(v === "" ? "" : Number(v))}
        keyboardType="numeric"
      />
    );
  }

  if (field.type === "SELECT") {
    return (
      <View style={styles.field}>
        <Text style={styles.label}>{label}</Text>
        <View style={styles.chips}>
          {options.map((option) => (
            <Chip key={option} label={option} selected={value === option} onPress={() => onChange(option)} />
          ))}
        </View>
      </View>
    );
  }

  if (field.type === "MULTISELECT") {
    const current = Array.isArray(value) ? value : [];
    return (
      <View style={styles.field}>
        <Text style={styles.label}>{label}</Text>
        <View style={styles.chips}>
          {options.map((option) => {
            const selected = current.includes(option);
            return (
              <Chip
                key={option}
                label={option}
                selected={selected}
                onPress={() => onChange(selected ? current.filter((v) => v !== option) : [...current, option])}
              />
            );
          })}
        </View>
      </View>
    );
  }

  if (field.type === "CHECKBOX") {
    return (
      <View style={styles.checkboxRow}>
        <Switch value={value === true} onValueChange={onChange} trackColor={{ true: colors.accentFrom }} />
        <Text style={styles.checkboxLabel}>{field.label}</Text>
      </View>
    );
  }

  return null;
}

function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, selected && styles.chipSelected]}>
      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  field: { gap: spacing.xs },
  label: { color: colors.foreground, fontSize: 13, fontWeight: "500" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  chip: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.full, paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
  chipSelected: { backgroundColor: colors.accentFrom, borderColor: colors.accentFrom },
  chipText: { color: colors.foreground, fontSize: 13 },
  chipTextSelected: { color: colors.white },
  checkboxRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  checkboxLabel: { color: colors.foreground, fontSize: 14, flexShrink: 1 },
});
