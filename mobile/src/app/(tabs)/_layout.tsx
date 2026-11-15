import Ionicons from "@expo/vector-icons/Ionicons";
import { Tabs } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { cartSummary, useCart } from "@/lib/queries";
import { colors, shadow } from "@/lib/theme";

type IconName = keyof typeof Ionicons.glyphMap;

const icon = (name: IconName, active: IconName) =>
  ({ focused, size }: { focused: boolean; size: number }) => (
    <Ionicons name={focused ? active : name} size={size} color={focused ? colors.primary : colors.muted} />
  );

/** Raised green circle in the middle of the tab bar. */
function CartButton({ focused, count }: { focused: boolean; count: number }) {
  return (
    <View style={[s.cart, shadow, focused && { backgroundColor: colors.primaryDark }]}>
      <Ionicons name="cart" size={26} color={colors.onPrimary} />
      {count > 0 && (
        <View style={s.badge}>
          <Text style={s.badgeText}>{count > 99 ? "99+" : count}</Text>
        </View>
      )}
    </View>
  );
}

export default function TabsLayout() {
  const { data } = useCart();
  const { count } = cartSummary(data);

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: s.bar,
        tabBarLabelStyle: { fontSize: 11, fontWeight: "600" },
        headerShadowVisible: false,
        headerStyle: { backgroundColor: colors.background },
        headerTitleStyle: { color: colors.text, fontWeight: "700", fontSize: 20 },
        sceneStyle: { backgroundColor: colors.background },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Home", headerShown: false, tabBarIcon: icon("home-outline", "home") }} />
      <Tabs.Screen name="shop" options={{ title: "Shop", tabBarIcon: icon("storefront-outline", "storefront") }} />
      <Tabs.Screen
        name="cart"
        options={{
          title: "Cart",
          tabBarLabel: () => null,
          tabBarAccessibilityLabel: count > 0 ? `Cart, ${count} items` : "Cart",
          tabBarIcon: ({ focused }) => <CartButton focused={focused} count={count} />,
        }}
      />
      <Tabs.Screen name="orders" options={{ title: "Orders", tabBarIcon: icon("receipt-outline", "receipt") }} />
      <Tabs.Screen name="account" options={{ title: "Account", tabBarIcon: icon("person-outline", "person") }} />
    </Tabs>
  );
}

const s = StyleSheet.create({
  bar: { height: 68, paddingTop: 6, paddingBottom: 8, borderTopWidth: 0, backgroundColor: colors.surface, ...shadow },
  cart: {
    width: 58, height: 58, borderRadius: 29, backgroundColor: colors.primary, marginTop: -26,
    alignItems: "center", justifyContent: "center", borderWidth: 4, borderColor: colors.surface,
  },
  badge: {
    position: "absolute", top: -4, right: -4, minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 5,
    backgroundColor: colors.danger, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: colors.surface,
  },
  badgeText: { color: colors.onPrimary, fontSize: 11, fontWeight: "700" },
});
