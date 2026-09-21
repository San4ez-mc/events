/**
 * Runs inline, before hydration, to apply the saved theme (light/dark/system
 * — UX doc §46) without a flash of the wrong theme. Kept as a plain string
 * (not a React component) because it must execute synchronously in <head>,
 * before any CSS paints.
 */
export const THEME_STORAGE_KEY = "kiro-theme";

export const themeInitScript = `
(function () {
  try {
    var stored = localStorage.getItem("${THEME_STORAGE_KEY}");
    var theme = stored === "light" || stored === "dark" ? stored : "system";
    var isDark = theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    if (isDark) document.documentElement.classList.add("dark");
  } catch (e) {}
})();
`;
