import Ionicons from "@expo/vector-icons/Ionicons";
import { useRouter } from "expo-router";
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import type { OrderStatus } from "@shared/api";
import { EmptyState, ErrorState, Loading } from "@/components/States";
import { Button } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { formatSlotDate, statusLabel } from "@/lib/orders";
import { useOrders } from "@/lib/queries";
import { colors, formatUGX, radius, shadow, spacing } from "@/lib/theme";

const tone: Partial<Record<OrderStatus, { bg: string; fg: string }>> = {
  delivered: { bg: colors.primarySoft, fg: colors.primary },
  cancelled: { bg: "#F3F3F3", fg: colors.muted },
};

export default function OrdersTab() {
  const router = useRouter();
  const { status } = useAuth();
  const orders = useOrders();

  if (status !== "signedIn") {
    return (
      <EmptyState
        title="Track your orders"
        body="Sign in to see your orders and follow deliveries."
        action={<Button title="Sign in" onPress={() => router.push("/sign-in")} />}
      />
    );
  }
  if (orders.isLoading) return <Loading label="Loading orders" />;
  if (orders.error && !orders.data) return <ErrorState error={orders.error} onRetry={() => void orders.refetch()} />;

  return (
    <FlatList
      data={orders.data}
      keyExtractor={(o) => String(o.id)}
      contentContainerStyle={{ padding: spacing.md, gap: spacing.md, flexGrow: 1 }}
      refreshControl={
        <RefreshControl refreshing={orders.isRefetching} onRefresh={() => void orders.refetch()} tintColor={colors.primary} colors={[colors.primary]} />
      }
      ListEmptyComponent={
        <EmptyState title="No orders yet" body="Your orders will appear here." action={<Button title="Start shopping" onPress={() => router.navigate("/")} />} />
      }
      renderItem={({ item }) => {
        const st = (item.status ?? "pending") as OrderStatus;
        const label = statusLabel[st] ?? item.status;
        const t = tone[st] ?? { bg: "#FFF4E5", fg: colors.warning };
        return (
          <Pressable
            onPress={() => router.push({ pathname: "/orders/[id]", params: { id: String(item.id) } })}
            style={({ pressed }) => [s.card, pressed && { opacity: 0.85 }]}
            accessibilityRole="button"
            accessibilityLabel={`Order ${item.id}, ${label}, ${formatUGX(item.total)}`}
          >
            <View style={s.icon}>
              <Ionicons name="bag-handle-outline" size={22} color={colors.primary} />
            </View>
            <View style={{ flex: 1, gap: 3 }}>
              <Text style={s.title}>Order #{item.id}</Text>
              <Text style={s.sub}>{item.slotDate ? `${formatSlotDate(item.slotDate)} · ${item.slotLabel ?? ""}` : ""}</Text>
              <View style={[s.pill, { backgroundColor: t.bg }]}>
                <Text style={[s.pillText, { color: t.fg }]}>{label}</Text>
              </View>
            </View>
            <Text style={s.total}>{formatUGX(item.total)}</Text>
          </Pressable>
        );
      }}
    />
  );
}

const s = StyleSheet.create({
  card: {
    flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.md,
    borderRadius: radius.lg, backgroundColor: colors.surface, ...shadow,
  },
  icon: { width: 46, height: 46, borderRadius: 23, backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 16, fontWeight: "700", color: colors.text },
  sub: { fontSize: 13, color: colors.muted },
  pill: { alignSelf: "flex-start", paddingHorizontal: 10, paddingVertical: 3, borderRadius: radius.pill, marginTop: 2 },
  pillText: { fontSize: 12, fontWeight: "700" },
  total: { fontWeight: "700", color: colors.text, fontSize: 15 },
});
