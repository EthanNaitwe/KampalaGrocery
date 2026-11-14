import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { ProductImage } from "@/components/ProductImage";
import { QuantityStepper } from "@/components/QuantityStepper";
import { ErrorState, Loading } from "@/components/States";
import { Button, styles } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { errorMessage } from "@/lib/errors";
import { cartSummary, useAddToCart, useCart, useProduct } from "@/lib/queries";
import { colors, formatUGX, spacing } from "@/lib/theme";
import { MAX_QTY } from "@/components/QuantityStepper";
import { sellableQuantity, stockLabel } from "@/lib/stock";

export default function ProductScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const productId = Number(id);
  const router = useRouter();
  const { status } = useAuth();
  const product = useProduct(productId);
  const cart = useCart();
  const add = useAddToCart();
  const [qty, setQty] = useState(1);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  if (product.isLoading) return <Loading label="Loading product" />;
  if (!product.data) return <ErrorState error={product.error} onRetry={() => void product.refetch()} />;

  const p = product.data;
  const inCart = cart.data?.find((i) => i.productId === p.id)?.quantity ?? 0;
  const sellable = sellableQuantity(p);
  const outOfStock = sellable <= 0;
  const stock = stockLabel(p);
  // Can't add more than what's in stock minus what's already in the cart.
  const maxAddable = Math.max(0, Math.min(MAX_QTY, sellable) - inCart);
  const shownQty = Math.max(1, Math.min(qty, maxAddable));

  const onAdd = () => {
    if (status !== "signedIn") return router.push("/sign-in");
    setFeedback(null);
    add.mutate(
      { productId: p.id, quantity: shownQty },
      {
        onSuccess: () => {
          setFeedback({ ok: true, text: `Added to cart` });
          setQty(1);
        },
        onError: (e) => setFeedback({ ok: false, text: errorMessage(e) }),
      },
    );
  };

  return (
    <>
      <Stack.Screen options={{ title: p.name }} />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}>
        <ProductImage uri={p.image} size={280} style={{ alignSelf: "center", borderRadius: 16 }} />
        <Text style={styles.title} accessibilityRole="header">{p.name}</Text>
        <Text style={{ fontSize: 20, fontWeight: "700", color: colors.primary }}>{formatUGX(p.price)}</Text>
        <Text style={{ color: outOfStock ? colors.danger : stock ? "#b45309" : colors.primary, fontWeight: "600" }}>
          {stock?.text ?? "In stock"}
        </Text>
        {!!p.description && <Text style={styles.body}>{p.description}</Text>}

        {!outOfStock && (
          <View style={{ gap: spacing.md, marginTop: spacing.sm }}>
            {status === "signedIn" && (
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <QuantityStepper value={shownQty} onChange={setQty} max={Math.max(1, maxAddable)} label={p.name} />
                {inCart > 0 && <Text style={styles.body}>{inCart} in cart</Text>}
              </View>
            )}
            <Button
              title={status === "signedIn" ? `Add to cart · ${formatUGX(Number(p.price) * qty)}` : "Sign in to add to cart"}
              onPress={onAdd}
              loading={add.isPending}
              disabled={status === "signedIn" && maxAddable <= 0}
            />
            {status === "signedIn" && maxAddable <= 0 && inCart > 0 && (
              <Text style={[styles.body, { textAlign: "center" }]}>You have all available stock in your cart.</Text>
            )}
            {!!feedback && (
              <Text
                accessibilityLiveRegion="polite"
                style={{ color: feedback.ok ? colors.primary : colors.danger, textAlign: "center" }}
              >
                {feedback.text}
                {feedback.ok && ` · ${cartSummary(cart.data).count} items in cart`}
              </Text>
            )}
          </View>
        )}
      </ScrollView>
    </>
  );
}
