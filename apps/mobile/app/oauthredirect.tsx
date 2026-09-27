import { Redirect } from "expo-router";

/** Safety net for the Google OAuth return link if the native-intent hook is bypassed: go home instead of "Unmatched Route". */
export default function OAuthRedirect() {
  return <Redirect href="/" />;
}
