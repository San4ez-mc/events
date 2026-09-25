import "react-native-gesture-handler";
import { StatusBar } from "expo-status-bar";
import { Stack } from "expo-router";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider } from "../src/lib/auth-context";
import { LocaleProvider } from "../src/lib/locale-context";
import { colors } from "../src/lib/theme";

/** §64 — root providers + the stack that hosts both the tab group and full-screen pushes (event detail, auth). */
export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <LocaleProvider>
          <AuthProvider>
            <StatusBar style="light" />
            <Stack
              screenOptions={{
                headerStyle: { backgroundColor: colors.background },
                headerTintColor: colors.foreground,
                contentStyle: { backgroundColor: colors.background },
              }}
            >
              <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
              <Stack.Screen name="login" options={{ headerShown: false, presentation: "modal" }} />
              <Stack.Screen name="register" options={{ headerShown: false, presentation: "modal" }} />
              <Stack.Screen name="event/[slug]" options={{ title: "" }} />
              <Stack.Screen name="users/[id]" options={{ title: "" }} />
              <Stack.Screen name="friends" options={{ title: "" }} />
              <Stack.Screen name="manage/[id]" options={{ title: "" }} />
              <Stack.Screen name="edit/[id]" options={{ title: "" }} />
              <Stack.Screen name="welcome" options={{ headerShown: false }} />
            </Stack>
          </AuthProvider>
        </LocaleProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
