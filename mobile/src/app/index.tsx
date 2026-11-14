import { useQuery } from "@tanstack/react-query";
import { ActivityIndicator, FlatList, Image, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import type { ProductResponse } from "@shared/api";
import { api, ApiError } from "@/lib/api";
import { colors, formatUGX, spacing } from "@/lib/theme";

export default function CatalogScreen() {
  const { data, error, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["products"],
    queryFn: () => api<ProductResponse[]>("/products"),
  });

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} accessibilityLabel="Loading products" />
      </View>
    );
  }

  if (error) {
    const message = error instanceof ApiError ? error.message : "Something went wrong.";
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>{message}</Text>
        <Pressable onPress={() => refetch()} style={styles.button} accessibilityRole="button">
          <Text style={styles.buttonText}>Try again</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <FlatList
      data={data}
      keyExtractor={(p) => String(p.id)}
      contentContainerStyle={{ padding: spacing.md, gap: spacing.sm }}
      refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} tintColor={colors.primary} />}
      ListEmptyComponent={<Text style={styles.muted}>No products available yet.</Text>}
      renderItem={({ item }) => (
        <View style={styles.card} accessible accessibilityLabel={`${item.name}, ${formatUGX(item.price)}`}>
          {item.image ? <Image source={{ uri: item.image }} style={styles.image} /> : <View style={styles.image} />}
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>{item.name}</Text>
            <Text style={styles.price}>{formatUGX(item.price)}</Text>
            {item.inStock === false && <Text style={styles.errorText}>Out of stock</Text>}
          </View>
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.lg, gap: spacing.md },
  card: {
    flexDirection: "row",
    gap: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  image: { width: 64, height: 64, borderRadius: 8, backgroundColor: colors.border },
  name: { fontSize: 16, fontWeight: "600", color: colors.text },
  price: { marginTop: spacing.xs, color: colors.primary, fontWeight: "600" },
  muted: { color: colors.muted, textAlign: "center" },
  errorText: { color: colors.danger, textAlign: "center" },
  button: { backgroundColor: colors.primary, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: 8 },
  buttonText: { color: "#fff", fontWeight: "600" },
});
