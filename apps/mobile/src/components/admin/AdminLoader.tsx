import { ActivityIndicator, View } from "react-native";
import { useTheme } from "../../lib/theme";

/** Spinner for admin lists/panels — sits well below the tabs, in the middle of the page rather than hugging the top edge. */
export function AdminLoader() {
  const { colors } = useTheme();
  return (
    <View style={{ paddingVertical: 120, alignItems: "center", justifyContent: "center" }}>
      <ActivityIndicator size="large" color={colors.accentFrom} />
    </View>
  );
}
