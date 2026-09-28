import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useColorScheme } from "react-native";
import * as SecureStore from "expo-secure-store";

export interface Palette {
  background: string;
  surface: string;
  border: string;
  foreground: string;
  muted: string;
  accentFrom: string;
  accentTo: string;
  danger: string;
  success: string;
  /** Always white: text/icons on the accent colour and on photo overlays, in both themes. */
  white: string;
}

/** Mirrors the web app's palette (apps/web/src/app/globals.css) closely enough for a consistent brand feel. */
export const darkColors: Palette = {
  background: "#0b0b12",
  surface: "#16161f",
  border: "#2a2a38",
  foreground: "#f5f5f7",
  muted: "#9a9aa8",
  accentFrom: "#8b5cf6",
  accentTo: "#ec4899",
  danger: "#ef4444",
  success: "#22c55e",
  white: "#ffffff",
};

export const lightColors: Palette = {
  background: "#f6f6fb",
  surface: "#ffffff",
  border: "#e2e2ec",
  foreground: "#14141c",
  muted: "#6a6a7a",
  accentFrom: "#7c3aed",
  accentTo: "#db2777",
  danger: "#dc2626",
  success: "#16a34a",
  white: "#ffffff",
};

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };

export const radius = { sm: 6, md: 10, lg: 14, full: 999 };

export type ThemeMode = "system" | "light" | "dark";

interface ThemeContextValue {
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
  scheme: "light" | "dark";
  colors: Palette;
}

const STORAGE_KEY = "kiro.themeMode";

const ThemeContext = createContext<ThemeContextValue>({ mode: "system", setMode: () => {}, scheme: "dark", colors: darkColors });

/**
 * §46 (UX) — light / dark / follow-the-system. The choice is stored on the device; until it has been read the
 * app follows the system setting, so there is no wrong-theme flash for people who never changed it.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode>("system");

  useEffect(() => {
    void SecureStore.getItemAsync(STORAGE_KEY)
      .then((stored) => {
        if (stored === "light" || stored === "dark" || stored === "system") setModeState(stored);
      })
      .catch(() => {});
  }, []);

  const value = useMemo<ThemeContextValue>(() => {
    const scheme = mode === "system" ? (system === "light" ? "light" : "dark") : mode;
    return {
      mode,
      scheme,
      colors: scheme === "light" ? lightColors : darkColors,
      setMode: (next) => {
        setModeState(next);
        void SecureStore.setItemAsync(STORAGE_KEY, next).catch(() => {});
      },
    };
  }, [mode, system]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext);
export const useColors = () => useContext(ThemeContext).colors;

/** Styles that depend on the palette: `const { colors, styles } = useThemedStyles(makeStyles);` with a module-level `makeStyles`. */
export function useThemedStyles<T>(make: (colors: Palette) => T): { colors: Palette; styles: T } {
  const colors = useColors();
  return useMemo(() => ({ colors, styles: make(colors) }), [colors, make]);
}
