import Ionicons from "@expo/vector-icons/Ionicons";
import { useRouter } from "expo-router";
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { ProductImage } from "@/components/ProductImage";
import { QuantityStepper } from "@/components/QuantityStepper";
import { EmptyState, ErrorState, Loading } from "@/components/States";
import { Button, styles } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { errorMessage } from "@/lib/errors";
import { cartSummary, useCart, useRemoveFromCart, useUpdateCartQuantity } from "@/lib/queries";
import { sellableQuantity } from "@/lib/stock";
import { colors, formatUGX, radius, shadow, spacing } from "@/lib/theme";

export default function CartScreen() {
  const router = useRouter();
  const { status } = useAuth();
  const cart = useCart();
  const update = useUpdateCartQuantity();
  const remove = useRemoveFromCart();

  if (status !== "signedIn") {
    return (
      <EmptyState
        icon="cart-outline"
        title="Sign in to start a cart"
        body="Your cart is saved to your account, so it's there on any device."
        action={<Button title="Sign in" onPress={() => router.push("/sign-in")} />}
      />
    );
  }
  if (cart.isLoading) return <Loading label="Loading cart" />;
  if (cart.error && !cart.data) return <ErrorState error={cart.error} onRetry={() => void cart.refetch()} />;

  const items = cart.data ?? [];
  const { count, subtotal } = cartSummary(items);
  const unavailable = items.some((i) => sellableQuantity(i.product) < i.quantity);
  const mutationError = update.error ?? remove.error;

  return (
    <View style={{ flex: 1 }}>
      <FlatList
        data={items}
        keyExtractor={(i) => String(i.productId)}
        contentContainerStyle={{ padding: spacing.md, gap: spacing.md, flexGrow: 1 }}
        refreshControl={
          <RefreshControl refreshing={cart.isRefetching} onRefresh={() => void cart.refetch()} tintColor={colors.primary} colors={[colors.primary]} />
        }
        ListHeaderComponent={items.length ? <Text style={s.count}>{count} item{count === 1 ? "" : "s"}</Text> : undefined}
        ListEmptyComponent={
          <EmptyState
            icon="cart-outline"
            title="Your cart is empty"
            body="Browse the shop and tap + to add groceries."
            action={<Button title="Start shopping" onPress={() => router.navigate("/")} />}
          />
        }
        renderItem={({ item }) => {
          const sellable = sellableQuantity(item.product);
          const problem =
            sellable <= 0 ? "No longer available" : sellable < item.quantity ? `Only ${sellable} left. Reduce the quantity to continue.` : null;
          return (
            <View style={[s.row, shadow, !!problem && { borderColor: colors.danger, borderWidth: 1 }]}>
              <Pressable onPress={() => router.push({ pathname: "/product/[id]", params: { id: String(item.productId) } })} accessibilityLabel={item.product.name}>
                <ProductImage uri={item.product.image} size={76} style={{ borderRadius: radius.md }} />
              </Pressable>
              <View style={{ flex: 1, gap: 4 }}>
                <View style={{ flexDirection: "row", gap: spacing.sm }}>
                  <Text style={[s.name, { flex: 1 }]} numberOfLines={2}>{item.product.name}</Text>
                  <Pressable
                    onPress={() => remove.mutate({ productId: item.productId })}
                    hitSlop={10}
                    accessibilityRole="button"
                    accessibilityLabel={`Remove ${item.product.name}`}
                  >
                    <Ionicons name="trash-outline" size={20} color={colors.muted} />
                  </Pressable>
                </View>
                <Text style={s.unit}>{formatUGX(item.product.price)} each</Text>
                {!!problem && <Text style={s.out}>{problem}</Text>}
                <View style={s.rowFooter}>
                  <Text style={s.price}>{formatUGX(Number(item.product.price) * item.quantity)}</Text>
                  <QuantityStepper
                    value={item.quantity}
                    max={Number.isFinite(sellable) ? Math.max(sellable, 1) : undefined}
                    label={item.product.name}
                    onChange={(quantity) => update.mutate({ productId: item.productId, quantity })}
                  />
                </View>
              </View>
            </View>
          );
        }}
      />

      {items.length > 0 && (
        <View style={[s.footer, shadow]}>
          {!!mutationError && <Text style={styles.error}>{errorMessage(mutationError)}</Text>}
          {unavailable && <Text style={styles.error}>Remove unavailable items or reduce quantities before checking out.</Text>}
          <View style={s.summaryRow}>
            <Text style={styles.body}>Subtotal</Text>
            <Text style={s.total}>{formatUGX(subtotal)}</Text>
          </View>
          <View style={s.summaryRow}>
            <Text style={styles.body}>Delivery</Text>
            <Text style={styles.body}>Calculated at checkout</Text>
          </View>
          <Button
            title={`Checkout · ${formatUGX(subtotal)}`}
            onPress={() => router.push("/checkout")}
            disabled={unavailable || update.isPending || remove.isPending}
          />
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  count: { fontSize: 15, color: colors.muted, fontWeight: "600" },
  row: {
    flexDirection: "row", gap: spacing.md, padding: spacing.md, backgroundColor: colors.surface,
    borderRadius: radius.lg, borderWidth: 1, borderColor: "transparent", alignItems: "flex-start",
  },
  name: { fontSize: 15, fontWeight: "600", color: colors.text },
  unit: { fontSize: 13, color: colors.muted },
  rowFooter: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 4 },
  price: { color: colors.text, fontWeight: "800", fontSize: 16 },
  out: { color: colors.danger, fontSize: 13, fontWeight: "600" },
  footer: {
    padding: spacing.md, gap: spacing.sm, backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg,
  },
  summaryRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  total: { fontSize: 18, fontWeight: "800", color: colors.text },
});
