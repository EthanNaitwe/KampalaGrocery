import Ionicons from "@expo/vector-icons/Ionicons";
import { useRouter } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useAuth } from "@/lib/auth";
import { useOrders } from "@/lib/queries";
import { colors, radius, shadow, spacing } from "@/lib/theme";

export const ACTIVE_STATUSES = ["pending", "confirmed", "preparing", "out_for_delivery"];

/** "Hello, Name" pill with avatar and an orders bell (dot while an order is in progress). */
export function Greeting() {
  const router = useRouter();
  const { status, user } = useAuth();
  const orders = useOrders();
  const signedIn = status === "signedIn";
  const name = user?.firstName?.trim();
  const initials = (name?.[0] ?? "").toUpperCase();
  const hasActive = !!orders.data?.some((o) => ACTIVE_STATUSES.includes(o.status ?? ""));

  return (
    <View style={[s.greeting, shadow]}>
      <Pressable
        onPress={() => router.push(signedIn ? "/account" : "/sign-in")}
        style={s.avatar}
        accessibilityRole="button"
        accessibilityLabel={signedIn ? "Account" : "Sign in"}
      >
        {initials ? <Text style={s.avatarText}>{initials}</Text> : <Ionicons name="person" size={20} color={colors.primary} />}
      </Pressable>
      <View style={{ flex: 1 }}>
        <Text style={s.hello} numberOfLines={1}>{signedIn ? `Hello${name ? `, ${name}` : ""}` : "Welcome to FreshMart"}</Text>
        <Text style={s.sub} numberOfLines={1}>{signedIn ? "What are we cooking today?" : "Sign in to save your cart and order"}</Text>
      </View>
      <Pressable
        onPress={() => router.push(signedIn ? "/orders" : "/sign-in")}
        style={s.bell}
        accessibilityRole="button"
        accessibilityLabel={hasActive ? "Orders, one in progress" : "Orders"}
      >
        <Ionicons name="notifications-outline" size={20} color={colors.text} />
        {hasActive && <View style={s.dot} />}
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  greeting: {
    flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.sm, paddingRight: spacing.md,
    backgroundColor: colors.surface, borderRadius: radius.pill,
  },
  avatar: { width: 46, height: 46, borderRadius: 23, backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center" },
  avatarText: { color: colors.primary, fontWeight: "700", fontSize: 18 },
  hello: { fontSize: 16, fontWeight: "700", color: colors.text },
  sub: { fontSize: 12, color: colors.muted, marginTop: 1 },
  bell: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.background, alignItems: "center", justifyContent: "center" },
  dot: {
    position: "absolute", top: 9, right: 10, width: 9, height: 9, borderRadius: 5,
    backgroundColor: colors.danger, borderWidth: 1.5, borderColor: colors.surface,
  },
});
