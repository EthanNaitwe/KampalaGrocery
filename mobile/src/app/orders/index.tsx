import Ionicons from "@expo/vector-icons/Ionicons";
import { Link, useRouter } from "expo-router";
import { FlatList, Pressable, RefreshControl, Text, View } from "react-native";
import type { OrderStatus } from "@shared/api";
import { EmptyState, ErrorState, Loading } from "@/components/States";
import { Button, styles } from "@/components/ui";
import { formatDateTime, statusColor, statusLabel } from "@/lib/orders";
import { useOrders } from "@/lib/queries";
import { colors, formatUGX, spacing } from "@/lib/theme";

export default function OrdersScreen() {
  const router = useRouter();
  const orders = useOrders();

  if (orders.isLoading) return <Loading label="Loading orders" />;
  if (orders.error && !orders.data) return <ErrorState error={orders.error} onRetry={() => void orders.refetch()} />;

  return (
    <FlatList
      data={orders.data}
      keyExtractor={(o) => String(o.id)}
      contentContainerStyle={{ padding: spacing.md, gap: spacing.sm, flexGrow: 1 }}
      refreshControl={<RefreshControl refreshing={orders.isRefetching} onRefresh={() => void orders.refetch()} tintColor={colors.primary} />}
      ListEmptyComponent={
        <EmptyState title="No orders yet" body="Your orders will appear here." action={<Button title="Start shopping" onPress={() => router.navigate("/")} />} />
      }
      renderItem={({ item }) => {
        const label = statusLabel[(item.status ?? "pending") as OrderStatus] ?? item.status;
        return (
          <Link href={{ pathname: "/orders/[id]", params: { id: String(item.id) } }} asChild>
            <Pressable
              style={({ pressed }) => [
                { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.md, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
                pressed && { opacity: 0.7 },
              ]}
              accessibilityRole="button"
              accessibilityLabel={`Order ${item.id}, ${label}, ${formatUGX(item.total)}`}
            >
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={{ fontSize: 16, fontWeight: "600", color: colors.text }}>Order #{item.id}</Text>
                <Text style={styles.body}>{formatDateTime(item.createdAt)}{item.slotLabel ? ` · ${item.slotLabel}` : ""}</Text>
                <Text style={{ fontWeight: "600", color: statusColor(item.status) }}>{label}</Text>
              </View>
              <Text style={{ fontWeight: "700", color: colors.text }}>{formatUGX(item.total)}</Text>
              <Ionicons name="chevron-forward" size={18} color={colors.muted} />
            </Pressable>
          </Link>
        );
      }}
    />
  );
}
