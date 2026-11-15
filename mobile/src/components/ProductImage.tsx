import { Image } from "expo-image";
import { useState } from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { colors } from "@/lib/theme";

/** Cached product image with a neutral placeholder when missing or failing to load. */
export function ProductImage({
  uri,
  size,
  height,
  style,
}: {
  uri?: string | null;
  /** Width (and height, unless `height` is given). */
  size: number;
  height?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const [failed, setFailed] = useState(false);
  const h = height ?? size;
  const box = [{ width: size, height: h, borderRadius: 10, backgroundColor: colors.background, overflow: "hidden" as const }, style];

  if (!uri || failed) {
    return (
      <View style={[box, { alignItems: "center", justifyContent: "center" }]} accessible={false}>
        <Ionicons name="basket-outline" size={Math.min(size, h) * 0.4} color={colors.muted} />
      </View>
    );
  }
  return (
    <View style={box}>
      <Image
        source={{ uri }}
        style={{ width: "100%", height: "100%" }}
        contentFit="cover"
        transition={150}
        cachePolicy="memory-disk"
        recyclingKey={uri}
        onError={() => setFailed(true)}
        accessible={false}
      />
    </View>
  );
}
