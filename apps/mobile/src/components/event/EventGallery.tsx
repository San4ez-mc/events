import { useState } from "react";
import { Image, Linking, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions, type NativeScrollEvent, type NativeSyntheticEvent } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { EventMedia } from "../../lib/event-types";
import { colors, radius } from "../../lib/theme";

/** UX §10 — swipeable gallery of up to 10 photos/videos. Videos show their thumbnail; tapping opens the system player. */
export function EventGallery({ media, width }: { media: EventMedia[]; width?: number }) {
  const window = useWindowDimensions();
  const w = width ?? window.width;
  const [index, setIndex] = useState(0);

  if (media.length === 0) {
    return (
      <View style={[styles.item, { width: w }, styles.placeholder]}>
        <Ionicons name="calendar" size={56} color="rgba(255,255,255,0.7)" />
      </View>
    );
  }

  function onScroll(e: NativeSyntheticEvent<NativeScrollEvent>) {
    setIndex(Math.round(e.nativeEvent.contentOffset.x / w));
  }

  return (
    <View>
      <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false} onScroll={onScroll} scrollEventThrottle={16}>
        {media.map((m) => (
          <View key={m.id} style={{ width: w }}>
            <Image source={{ uri: m.type === "VIDEO" ? m.thumbnailUrl : m.displayUrl }} style={styles.item} resizeMode="cover" />
            {m.type === "VIDEO" && (
              <Pressable style={styles.play} onPress={() => void Linking.openURL(m.originalUrl ?? m.displayUrl)} accessibilityLabel="Play video">
                <Ionicons name="play" size={30} color={colors.white} />
              </Pressable>
            )}
          </View>
        ))}
      </ScrollView>

      {media.length > 1 && (
        <>
          <View style={styles.counter}>
            <Text style={styles.counterText}>
              {index + 1} / {media.length}
            </Text>
          </View>
          <View style={styles.dots} pointerEvents="none">
            {media.map((m, i) => (
              <View key={m.id} style={[styles.dot, i === index && styles.dotOn]} />
            ))}
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  item: { height: 420, backgroundColor: colors.surface },
  placeholder: { backgroundColor: colors.accentFrom, alignItems: "center", justifyContent: "center" },
  play: { position: "absolute", top: "50%", left: "50%", marginTop: -32, marginLeft: -32, width: 64, height: 64, borderRadius: 32, backgroundColor: "rgba(0,0,0,0.55)", alignItems: "center", justifyContent: "center" },
  counter: { position: "absolute", top: 12, right: 12, backgroundColor: "rgba(0,0,0,0.55)", borderRadius: radius.full, paddingHorizontal: 10, paddingVertical: 4 },
  counterText: { color: colors.white, fontSize: 12, fontWeight: "700" },
  dots: { position: "absolute", bottom: 12, left: 0, right: 0, flexDirection: "row", justifyContent: "center", gap: 6 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.5)" },
  dotOn: { width: 18, backgroundColor: colors.white },
});
