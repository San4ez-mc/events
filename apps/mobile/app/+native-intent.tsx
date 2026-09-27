/**
 * Google sign-in returns to the app through a deep link like `kiro://oauthredirect?code=…` (or
 * `space.fineko.kiro:/oauthredirect`). expo-auth-session consumes that URL itself; without this hook Expo Router
 * also tries to open it as a screen and shows "Unmatched Route". Returning null keeps the app on the current
 * screen (the login form), where the sign-in then completes.
 */
export function redirectSystemPath({ path }: { path: string; initial: boolean }): string | null {
  if (/oauthredirect/i.test(path)) return null;
  return path;
}
