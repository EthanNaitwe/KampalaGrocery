import Ionicons from "@expo/vector-icons/Ionicons";
import { Tabs } from "expo-router";
import { cartSummary, useCart } from "@/lib/queries";
import { colors } from "@/lib/theme";

export default function TabsLayout() {
  const { data } = useCart();
  const { count } = cartSummary(data);

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.muted,
        headerTitleStyle: { color: colors.text },
        sceneStyle: { backgroundColor: colors.background },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "FreshMart",
          tabBarLabel: "Shop",
          tabBarIcon: ({ focused, size }) => <Ionicons name="storefront-outline" color={focused ? colors.primary : colors.muted} size={size} />,
        }}
      />
      <Tabs.Screen
        name="cart"
        options={{
          title: "Cart",
          tabBarBadge: count > 0 ? (count > 99 ? "99+" : count) : undefined,
          tabBarAccessibilityLabel: count > 0 ? `Cart, ${count} items` : "Cart",
          tabBarIcon: ({ focused, size }) => <Ionicons name="cart-outline" color={focused ? colors.primary : colors.muted} size={size} />,
        }}
      />
      <Tabs.Screen
        name="account"
        options={{
          title: "Account",
          tabBarIcon: ({ focused, size }) => <Ionicons name="person-outline" color={focused ? colors.primary : colors.muted} size={size} />,
        }}
      />
    </Tabs>
  );
}
