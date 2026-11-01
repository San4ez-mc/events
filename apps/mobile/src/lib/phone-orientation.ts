import * as ScreenOrientation from "expo-screen-orientation";
import { Dimensions } from "react-native";

/** Android 16 ignores orientation locks on large screens (Play flags them), so the manifest stays unlocked and phones are held in portrait here. */
const TABLET_MIN_SIDE_DP = 600;

export function lockPhonesToPortrait(): void {
  const { width, height } = Dimensions.get("screen");
  if (Math.min(width, height) >= TABLET_MIN_SIDE_DP) return;
  ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {
    // not locking is harmless: the app is usable in landscape too
  });
}
