import Ionicons from "@expo/vector-icons/Ionicons";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import type { ProductResponse } from "@shared/api";
import { ProductImage } from "./ProductImage";
import { useAuth } from "@/lib/auth";
import { errorMessage } from "@/lib/errors";
import { useAddToCart, useCart } from "@/lib/queries";
import { sellableQuantity, stockLabel } from "@/lib/stock";
import { colors, formatUGX, radius, shadow, spacing } from "@/lib/theme";

/** Grid tile: tap to open the product, "+" to add one to the cart. */
export function ProductCard({ product, width }: { product: ProductResponse; width: number }) {
  const router = useRouter();
  const { status } = useAuth();
  const cart = useCart();
  const add = useAddToCart();
  const [justAdded, setJustAdded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!justAdded) return;
    const t = setTimeout(() => setJustAdded(false), 1200);
    return () => clearTimeout(t);
  }, [justAdded]);

  const stock = stockLabel(product);
  const inCart = cart.data?.find((i) => i.productId === product.id)?.quantity ?? 0;
  const canAdd = sellableQuantity(product) > inCart && inCart < 99;
  const imageSize = width - spacing.md * 2;

  const onAdd = () => {
    if (status !== "signedIn") return router.push("/sign-in");
    setError(null);
    add.mutate(
      { productId: product.id, quantity: 1 },
      { onSuccess: () => setJustAdded(true), onError: (e) => setError(errorMessage(e)) },
    );
  };

  return (
    <Pressable
      onPress={() => router.push({ pathname: "/product/[id]", params: { id: String(product.id) } })}
      style={({ pressed }) => [s.card, { width }, pressed && { opacity: 0.85 }]}
      accessibilityRole="button"
      accessibilityLabel={`${product.name}, ${formatUGX(product.price)}${stock ? `, ${stock.text}` : ""}`}
    >
      <View style={s.imageWrap}>
        <ProductImage uri={product.image} size={imageSize} height={Math.round(imageSize * 0.75)} style={{ borderRadius: radius.md }} />
        {!!inCart && (
          <View style={s.inCart} accessibilityLabel={`${inCart} in cart`}>
            <Text style={s.inCartText}>{inCart}</Text>
          </View>
        )}
      </View>
      <Text style={s.name} numberOfLines={2}>{product.name}</Text>
      <View style={s.footer}>
        <View style={{ flex: 1 }}>
          <Text style={s.price}>{formatUGX(product.price)}</Text>
          {!!stock && <Text style={[s.stock, { color: stock.out ? colors.danger : colors.warning }]}>{stock.text}</Text>}
        </View>
        <Pressable
          onPress={onAdd}
          disabled={!canAdd || add.isPending}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={status === "signedIn" ? `Add ${product.name} to cart` : "Sign in to add to cart"}
          accessibilityState={{ disabled: !canAdd || add.isPending }}
          style={[s.add, justAdded && s.addDone, !canAdd && { opacity: 0.35 }]}
        >
          {add.isPending ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <Ionicons name={justAdded ? "checkmark" : "add"} size={20} color={justAdded ? colors.onPrimary : colors.text} />
          )}
        </Pressable>
      </View>
      {!!error && <Text style={s.error} numberOfLines={2}>{error}</Text>}
    </Pressable>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, gap: 6, ...shadow },
  imageWrap: { alignItems: "center" },
  inCart: {
    position: "absolute", top: 6, right: 6, minWidth: 24, height: 24, borderRadius: 12, paddingHorizontal: 6,
    backgroundColor: colors.primary, alignItems: "center", justifyContent: "center",
  },
  inCartText: { color: colors.onPrimary, fontSize: 12, fontWeight: "700" },
  name: { fontSize: 14, fontWeight: "600", color: colors.text, minHeight: 38, lineHeight: 19 },
  footer: { flexDirection: "row", alignItems: "flex-end", gap: spacing.sm },
  price: { fontSize: 16, fontWeight: "700", color: colors.text },
  stock: { fontSize: 12, fontWeight: "600", marginTop: 2 },
  add: {
    width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderColor: colors.border,
    alignItems: "center", justifyContent: "center", backgroundColor: colors.surface,
  },
  addDone: { backgroundColor: colors.primary, borderColor: colors.primary },
  error: { color: colors.danger, fontSize: 12 },
});
