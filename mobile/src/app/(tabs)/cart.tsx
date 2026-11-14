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
import { colors, formatUGX, spacing } from "@/lib/theme";

export default function CartScreen() {
  const router = useRouter();
  const { status } = useAuth();
  const cart = useCart();
  const update = useUpdateCartQuantity();
  const remove = useRemoveFromCart();

  if (status !== "signedIn") {
    return (
      <EmptyState
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
        contentContainerStyle={{ padding: spacing.md, gap: spacing.sm, flexGrow: 1 }}
        refreshControl={
          <RefreshControl refreshing={cart.isRefetching} onRefresh={() => void cart.refetch()} tintColor={colors.primary} />
        }
        ListEmptyComponent={
          <EmptyState
            title="Your cart is empty"
            body="Browse the shop and add a few things."
            action={<Button title="Start shopping" onPress={() => router.navigate("/")} />}
          />
        }
        renderItem={({ item }) => {
          const sellable = sellableQuantity(item.product);
          return (
          <View style={s.row}>
            <ProductImage uri={item.product.image} size={60} />
            <View style={{ flex: 1, gap: spacing.xs }}>
              <Text style={s.name} numberOfLines={2}>{item.product.name}</Text>
              <Text style={s.price}>{formatUGX(Number(item.product.price) * item.quantity)}</Text>
              {sellable <= 0 ? (
                <Text style={s.out}>No longer available</Text>
              ) : sellable < item.quantity ? (
                <Text style={s.out}>Only {sellable} left. Reduce the quantity to continue.</Text>
              ) : null}
              <QuantityStepper
                value={item.quantity}
                max={Number.isFinite(sellable) ? Math.max(sellable, 1) : undefined}
                label={item.product.name}
                onChange={(quantity) => update.mutate({ productId: item.productId, quantity })}
              />
            </View>
            <Pressable
              onPress={() => remove.mutate({ productId: item.productId })}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel={`Remove ${item.product.name}`}
            >
              <Ionicons name="trash-outline" size={22} color={colors.danger} />
            </Pressable>
          </View>
          );
        }}
      />

      {items.length > 0 && (
        <View style={s.footer}>
          {!!mutationError && <Text style={styles.error}>{errorMessage(mutationError)}</Text>}
          {unavailable && <Text style={styles.error}>Remove unavailable items or reduce quantities before checking out.</Text>}
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <Text style={styles.body}>Subtotal · {count} items</Text>
            <Text style={s.total}>{formatUGX(subtotal)}</Text>
          </View>
          <Text style={[styles.body, { fontSize: 13 }]}>Delivery fee and final total are confirmed at checkout.</Text>
          <Button title="Checkout" onPress={() => router.push("/checkout")} disabled={unavailable || update.isPending || remove.isPending} />
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  row: {
    flexDirection: "row",
    gap: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "flex-start",
  },
  name: { fontSize: 15, fontWeight: "600", color: colors.text },
  price: { color: colors.primary, fontWeight: "700" },
  out: { color: colors.danger, fontSize: 13, fontWeight: "600" },
  footer: {
    padding: spacing.md,
    gap: spacing.sm,
    borderTopWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  total: { fontSize: 18, fontWeight: "700", color: colors.text },
});
