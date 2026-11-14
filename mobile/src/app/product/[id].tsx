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
  const outOfStock = p.inStock === false;
  const maxAddable = MAX_QTY - inCart;

  const onAdd = () => {
    if (status !== "signedIn") return router.push("/sign-in");
    setFeedback(null);
    add.mutate(
      { productId: p.id, quantity: Math.min(qty, maxAddable) },
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
        {outOfStock ? (
          <Text style={{ color: colors.danger, fontWeight: "600" }}>Out of stock</Text>
        ) : (
          <Text style={{ color: colors.primary, fontWeight: "600" }}>In stock</Text>
        )}
        {!!p.description && <Text style={styles.body}>{p.description}</Text>}

        {!outOfStock && (
          <View style={{ gap: spacing.md, marginTop: spacing.sm }}>
            {status === "signedIn" && (
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <QuantityStepper value={qty} onChange={setQty} label={p.name} />
                {inCart > 0 && <Text style={styles.body}>{inCart} in cart</Text>}
              </View>
            )}
            <Button
              title={status === "signedIn" ? `Add to cart · ${formatUGX(Number(p.price) * qty)}` : "Sign in to add to cart"}
              onPress={onAdd}
              loading={add.isPending}
              disabled={status === "signedIn" && maxAddable <= 0}
            />
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
