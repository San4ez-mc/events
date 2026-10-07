/**
 * app.json -> app.config.js: only reason for the switch is `googleServicesFile` needs to come
 * from an EAS "file" environment variable on remote builds (the actual google-services.json is
 * gitignored — see .gitignore — since this repo is public, so EAS's remote builder never has it
 * on disk unless it's uploaded as a secret env var and referenced via process.env here). Static
 * JSON (app.json) can't read env vars at all, hence this file.
 *
 * Local/dev builds keep working from the real file at ./google-services.json.
 * Remote EAS builds need: eas env:create --scope project --name GOOGLE_SERVICES_JSON
 *   --type file --visibility secret --value ./google-services.json --environment preview
 * (repeat with --environment production for production builds).
 */
module.exports = {
  expo: {
    name: "Кіро",
    slug: "kiro",
    scheme: ["kiro", "space.fineko.kiro", "com.googleusercontent.apps.257175906055-ae1pea6dav87793tbpsub09j7u5tkn6q"],
    version: "1.0.0",
    orientation: "portrait",
    icon: "./assets/icon.png",
    userInterfaceStyle: "automatic",
    newArchEnabled: true,
    ios: {
      supportsTablet: true,
      bundleIdentifier: "space.fineko.kiro",
      associatedDomains: ["applinks:kiro.fineko.space"],
    },
    android: {
      package: "space.fineko.kiro",
      adaptiveIcon: {
        backgroundColor: "#21232d",
        foregroundImage: "./assets/android-icon-foreground.png",
        backgroundImage: "./assets/android-icon-background.png",
        monochromeImage: "./assets/android-icon-monochrome.png",
      },
      predictiveBackGestureEnabled: false,
      intentFilters: [
        {
          action: "VIEW",
          autoVerify: true,
          data: [
            { scheme: "https", host: "kiro.fineko.space", pathPrefix: "/events" },
            { scheme: "https", host: "kiro.fineko.space", pathPrefix: "/users" },
          ],
          category: ["BROWSABLE", "DEFAULT"],
        },
      ],
      googleServicesFile: process.env.GOOGLE_SERVICES_JSON ?? "./google-services.json",
    },
    web: {
      favicon: "./assets/favicon.png",
      bundler: "metro",
    },
    plugins: [
      "expo-router",
      "expo-secure-store",
      ["expo-image-picker", { photosPermission: "Кіро потребує доступу до фото та відео, щоб додати їх до вашої події." }],
      "expo-web-browser",
      "expo-notifications",
      "expo-font",
      "expo-video",
      [
        "expo-build-properties",
        {
          android: {
            // Google Play flags "DEX code optimization below threshold" (obfuscation 1% < 25%): turn on R8 shrinking +
            // obfuscation and resource shrinking for release builds. Expo modules ship their own keep rules; the first
            // build with this should go through closed testing before it is promoted (a bad keep rule only shows at runtime).
            enableProguardInReleaseBuilds: true,
            enableShrinkResourcesInReleaseBuilds: true,
          },
        },
      ],
    ],
    extra: {
      router: {},
      eas: { projectId: "72e650b2-37e9-4818-a83d-ae1ea37ddf23" },
    },
  },
};
