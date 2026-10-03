import { Modal, Pressable, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { VideoView, useVideoPlayer } from "expo-video";
import { WebView } from "react-native-webview";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export type VideoSource = { kind: "youtube"; id: string } | { kind: "file"; uri: string };

function FilePlayer({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri, (p) => {
    p.play();
  });
  return <VideoView player={player} style={styles.video} nativeControls fullscreenOptions={{ enable: true }} contentFit="contain" />;
}

function YouTubePlayer({ id }: { id: string }) {
  // The page is served from our own origin so YouTube accepts the embed (a bare embed URL is refused without a referrer).
  const html = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;height:100%;background:#000}iframe{position:absolute;inset:0;width:100%;height:100%;border:0}</style></head><body><iframe src="https://www.youtube.com/embed/${id}?playsinline=1&autoplay=1&rel=0" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe></body></html>`;
  return (
    <WebView
      style={styles.video}
      source={{ html, baseUrl: "https://kiro.fineko.space" }}
      originWhitelist={["*"]}
      javaScriptEnabled
      allowsInlineMediaPlayback
      allowsFullscreenVideo
      mediaPlaybackRequiresUserAction={false}
      setSupportMultipleWindows={false}
    />
  );
}

/** Plays an uploaded video or a YouTube link inside the app (full-screen overlay) instead of handing off to another app/site. */
export function VideoPlayerModal({ source, onClose }: { source: VideoSource | null; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={source !== null} animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.container}>
        {source?.kind === "file" && <FilePlayer uri={source.uri} />}
        {source?.kind === "youtube" && <YouTubePlayer id={source.id} />}
        <Pressable style={[styles.close, { top: insets.top + 12 }]} onPress={onClose} hitSlop={12} accessibilityLabel="Close video">
          <Ionicons name="close" size={26} color="#fff" />
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000", justifyContent: "center" },
  video: { flex: 1, backgroundColor: "#000" },
  close: { position: "absolute", right: 16, width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(0,0,0,0.6)", alignItems: "center", justifyContent: "center" },
});
