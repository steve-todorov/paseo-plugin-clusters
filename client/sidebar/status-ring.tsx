import { useEffect, useRef } from "react";
import { Animated, Easing, Platform, Text, View } from "react-native";

/*
 * The spinning ring Paseo shows on a running workspace (components/status-ring, v0.16): a 6pt dot,
 * a 12pt ring at 30% and a turning quarter at 90%, one turn every 900 ms. With `backdrop`, the 14pt
 * frame around it is filled with that colour so the ring reads as cut out of what it overlaps.
 */
export function StatusRing({ color, backdrop }: { color: string; backdrop?: string }) {
  const spin = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(spin, { toValue: 1, duration: 900, easing: Easing.linear, useNativeDriver: Platform.OS !== "web" }),
    );
    loop.start();
    return () => loop.stop();
  }, [spin]);
  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] });
  const ring = { position: "absolute" as const, width: 12, height: 12, borderRadius: 6, borderWidth: 1.5 };
  return (
    <View style={{ width: 14, height: 14, borderRadius: 7, alignItems: "center", justifyContent: "center", backgroundColor: backdrop }}>
      <View style={[ring, { borderColor: color, opacity: 0.3 }]} />
      <Animated.View style={[ring, { borderColor: "transparent", borderTopColor: color, opacity: 0.9, transform: [{ rotate }] }]} />
      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: color }} />
    </View>
  );
}

/**
 * A 12pt filled circle with a dark glyph: Paseo's needs_input alert ("!", the app's filled
 * CircleAlert, which the plugin `Icon` cannot fill), and the same shape for an open Progress
 * question ("?").
 */
export function CircleGlyph({ glyph, color, ink, label }: { glyph: "!" | "?"; color: string; ink: string; label?: string }) {
  return (
    <View
      accessibilityLabel={label}
      style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: color, alignItems: "center", justifyContent: "center" }}
    >
      <Text style={{ color: ink, fontSize: 9, fontWeight: "700", lineHeight: 12 }}>{glyph}</Text>
    </View>
  );
}
