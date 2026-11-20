import * as Application from "expo-application";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

/**
 * A personal invitation code that came with the install: the landing page's "download" button sends people through
 * kiro.fineko.space/get?ref=<code>, which opens Google Play with `referrer=kiro_ref=<code>…`. Google hands that string to
 * the app once, after the first launch (Play Install Referrer). It is kept until the person signs up, then sent with the
 * registration so the admin can see who invited whom. Android only; people who typed the code by hand are unaffected.
 */
const CODE_KEY = "kiro_invite_code";
const CHECKED_KEY = "kiro_install_referrer_checked";
const CODE_LENGTH = 8;

export function normalizeInviteCode(raw: string | null | undefined): string | null {
  const code = (raw ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  return code.length === CODE_LENGTH ? code : null;
}

/** Reads the Play install referrer once per install (the answer never changes) and remembers a valid code. */
export async function captureInstallReferrer(): Promise<void> {
  if (Platform.OS !== "android") return;
  try {
    if (await SecureStore.getItemAsync(CHECKED_KEY)) return;
    const referrer = await Application.getInstallReferrerAsync();
    await SecureStore.setItemAsync(CHECKED_KEY, "1");
    const match = /(?:^|[&?])kiro_ref=([A-Za-z0-9-]+)/.exec(referrer ?? "");
    const code = normalizeInviteCode(match?.[1]);
    if (code) await SecureStore.setItemAsync(CODE_KEY, code);
  } catch {
    // No Play Store referrer (sideloaded build, emulator, old Play services): nothing to remember.
  }
}

export async function readStoredInviteCode(): Promise<string | null> {
  try {
    return normalizeInviteCode(await SecureStore.getItemAsync(CODE_KEY));
  } catch {
    return null;
  }
}

/** After a successful sign-up the code has done its job. */
export async function clearStoredInviteCode(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(CODE_KEY);
  } catch {
    // ignore
  }
}
