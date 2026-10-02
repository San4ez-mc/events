import "react-native-gesture-handler";
import { StatusBar } from "expo-status-bar";
import { Stack, useSegments } from "expo-router";
import { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider } from "../src/lib/auth-context";
import { LocaleProvider } from "../src/lib/locale-context";
import { ThemeProvider, useTheme } from "../src/lib/theme";
import { installCrashReporter } from "../src/lib/crash-reporter";
import { captureScreen } from "../src/lib/product-analytics";

installCrashReporter();

/** The navigator lives below ThemeProvider so its header/background and the status-bar icons follow the chosen theme. */
function ThemedStack() {
  const { colors, scheme } = useTheme();
  // Route pattern ("/event/[slug]"), not the concrete URL, so every event page groups under one screen.
  const segments = useSegments();
  const screen = `/${segments.filter((s) => !s.startsWith("(")).join("/")}`;
  useEffect(() => {
    captureScreen(screen === "/" ? "/discover" : screen);
  }, [screen]);
  return (
    <>
      {/* "light" = light icons, for the dark theme's dark background (and vice versa). */}
      <StatusBar style={scheme === "dark" ? "light" : "dark"} />
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
        <Stack.Screen name="share/[id]" options={{ title: "" }} />
        <Stack.Screen name="invite/[id]" options={{ title: "" }} />
        <Stack.Screen name="collaborators/[id]" options={{ title: "" }} />
        <Stack.Screen name="events/[slug]" options={{ title: "" }} />
        <Stack.Screen name="edit/[id]" options={{ title: "" }} />
        <Stack.Screen name="welcome" options={{ headerShown: false }} />
        <Stack.Screen name="admin" options={{ title: "" }} />
      </Stack>
    </>
  );
}

/** §64 — root providers + the stack that hosts both the tab group and full-screen pushes (event detail, auth). */
export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <LocaleProvider>
            <AuthProvider>
              <ThemedStack />
            </AuthProvider>
          </LocaleProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
