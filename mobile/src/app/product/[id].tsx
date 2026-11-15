import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ProductImage } from "@/components/ProductImage";
import { MAX_QTY, QuantityStepper } from "@/components/QuantityStepper";
import { ErrorState, Loading } from "@/components/States";
import { Button, styles } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { errorMessage } from "@/lib/errors";
import { cartSummary, useAddToCart, useCart, useCategories, useProduct } from "@/lib/queries";
import { sellableQuantity, stockLabel } from "@/lib/stock";
import { colors, formatUGX, radius, shadow, spacing } from "@/lib/theme";

export default function ProductScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const productId = Number(id);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { status } = useAuth();
  const product = useProduct(productId);
  const categories = useCategories();
  const cart = useCart();
  const add = useAddToCart();
  const [qty, setQty] = useState(1);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  if (product.isLoading) return <Loading label="Loading product" />;
  if (!product.data) return <ErrorState error={product.error} onRetry={() => void product.refetch()} />;

  const p = product.data;
  const category = categories.data?.find((c) => c.id === p.categoryId);
  const inCart = cart.data?.find((i) => i.productId === p.id)?.quantity ?? 0;
  const sellable = sellableQuantity(p);
  const outOfStock = sellable <= 0;
  const stock = stockLabel(p);
  // Can't add more than what's in stock minus what's already in the cart.
  const maxAddable = Math.max(0, Math.min(MAX_QTY, sellable) - inCart);
  const shownQty = Math.max(1, Math.min(qty, maxAddable));
  const signedIn = status === "signedIn";
  const imageWidth = Math.min(width, 640) - spacing.md * 4;

  const onAdd = () => {
    if (!signedIn) return router.push("/sign-in");
    setFeedback(null);
    add.mutate(
      { productId: p.id, quantity: shownQty },
      {
        onSuccess: () => {
          setFeedback({ ok: true, text: "Added to cart" });
          setQty(1);
        },
        onError: (e) => setFeedback({ ok: false, text: errorMessage(e) }),
      },
    );
  };

  const pill = outOfStock
    ? { bg: "#FDECEC", fg: colors.danger, text: "Out of stock" }
    : stock
      ? { bg: "#FFF4E5", fg: colors.warning, text: stock.text }
      : { bg: colors.primarySoft, fg: colors.primary, text: "In stock" };

  return (
    <>
      <Stack.Screen options={{ title: "", headerStyle: { backgroundColor: colors.background }, headerShadowVisible: false }} />
      <ScrollView contentContainerStyle={{ padding: spacing.md, gap: spacing.md, paddingBottom: 140 }}>
        <View style={[s.hero, shadow]}>
          <ProductImage uri={p.image} size={imageWidth} height={Math.round(imageWidth * 0.8)} style={{ borderRadius: radius.md }} />
        </View>

        <View style={[s.card, shadow]}>
          {!!category && (
            <Text style={s.category}>{category.icon ? `${category.icon} ` : ""}{category.name}</Text>
          )}
          <Text style={[styles.title, { fontSize: 22 }]} accessibilityRole="header">{p.name}</Text>
          <View style={s.priceRow}>
            <Text style={s.price}>{formatUGX(p.price)}</Text>
            <View style={[s.pill, { backgroundColor: pill.bg }]}>
              <Text style={[s.pillText, { color: pill.fg }]}>{pill.text}</Text>
            </View>
          </View>
          {!!p.description && <Text style={styles.body}>{p.description}</Text>}
          {inCart > 0 && <Text style={[styles.body, { color: colors.primary }]}>{inCart} already in your cart</Text>}
        </View>
      </ScrollView>

      {/* Sticky add-to-cart bar */}
      <View style={[s.bar, shadow, { paddingBottom: spacing.md + insets.bottom }]}>
        {!!feedback && (
          <Text accessibilityLiveRegion="polite" style={[s.feedback, { color: feedback.ok ? colors.primary : colors.danger }]}>
            {feedback.text}
            {feedback.ok && ` · ${cartSummary(cart.data).count} items in cart`}
          </Text>
        )}
        {outOfStock ? (
          <Button title="Out of stock" onPress={() => {}} disabled />
        ) : signedIn && maxAddable <= 0 ? (
          <Text style={[styles.body, { textAlign: "center" }]}>You have all available stock in your cart.</Text>
        ) : (
          <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
            {signedIn && <QuantityStepper value={shownQty} onChange={setQty} max={Math.max(1, maxAddable)} label={p.name} />}
            <View style={{ flex: 1 }}>
              <Button
                title={signedIn ? `Add · ${formatUGX(Number(p.price) * shownQty)}` : "Sign in to add to cart"}
                onPress={onAdd}
                loading={add.isPending}
              />
            </View>
          </View>
        )}
      </View>
    </>
  );
}

const s = StyleSheet.create({
  hero: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, alignItems: "center" },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, gap: spacing.sm },
  category: { fontSize: 13, color: colors.muted, fontWeight: "500" },
  priceRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.md },
  price: { fontSize: 22, fontWeight: "800", color: colors.primary },
  pill: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: radius.pill },
  pillText: { fontSize: 13, fontWeight: "700" },
  bar: {
    position: "absolute", left: 0, right: 0, bottom: 0, backgroundColor: colors.surface, padding: spacing.md, gap: spacing.sm,
    borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg,
  },
  feedback: { textAlign: "center", fontWeight: "600" },
});
