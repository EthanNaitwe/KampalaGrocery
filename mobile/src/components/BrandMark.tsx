import Ionicons from "@expo/vector-icons/Ionicons";
import { Text, View } from "react-native";
import { colors, spacing } from "@/lib/theme";

/** FreshMart logo mark used on sign-in screens. */
export function BrandMark() {
  return (
    <View style={{ alignItems: "center", gap: spacing.sm, marginBottom: spacing.sm }}>
      <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" }}>
        <Ionicons name="basket" size={36} color={colors.onPrimary} />
      </View>
      <Text style={{ fontSize: 22, fontWeight: "800", color: colors.primary, letterSpacing: -0.3 }}>FreshMart</Text>
    </View>
  );
}
