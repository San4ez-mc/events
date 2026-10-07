import { useEffect, useRef, useState } from "react";
import { Animated, Easing, Text, View } from "react-native";
import { useTheme } from "../../lib/theme";
import { useTranslations } from "../../lib/locale-context";

/**
 * Spinner for admin lists/panels. It rotates with the native driver, so it keeps turning even while the JS thread is
 * busy rendering a big response (the stock ActivityIndicator looked frozen for the first seconds of the traffic page).
 * After a few seconds it says the wait is expected, so a slow report doesn't read as a hang.
 */
export function AdminLoader() {
  const { colors } = useTheme();
  const { t } = useTranslations();
  const spin = useRef(new Animated.Value(0)).current;
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    const loop = Animated.loop(Animated.timing(spin, { toValue: 1, duration: 900, easing: Easing.linear, useNativeDriver: true }));
    loop.start();
    const timer = setTimeout(() => setSlow(true), 4000);
    return () => {
      loop.stop();
      clearTimeout(timer);
    };
  }, [spin]);

  return (
    <View style={{ paddingVertical: 100, alignItems: "center", justifyContent: "center", gap: 18 }}>
      <Animated.View
        style={{
          width: 52,
          height: 52,
          borderRadius: 26,
          borderWidth: 5,
          borderColor: colors.border,
          borderTopColor: colors.accentFrom,
          transform: [{ rotate: spin.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] }) }],
        }}
      />
      <Text style={{ color: colors.muted, fontSize: 14, textAlign: "center", paddingHorizontal: 24 }}>
        {slow ? t("admin.loadingSlow") : t("common.loading")}
      </Text>
    </View>
  );
}
