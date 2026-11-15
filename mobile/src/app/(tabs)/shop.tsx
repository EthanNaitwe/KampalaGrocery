import Ionicons from "@expo/vector-icons/Ionicons";
import { useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, TextInput, View, useWindowDimensions } from "react-native";
import { CategoryBubbles } from "@/components/CategoryBubbles";
import { ProductCard } from "@/components/ProductCard";
import { EmptyState, ErrorState, Loading } from "@/components/States";
import { useCategories, useProducts } from "@/lib/queries";
import { colors, radius, spacing } from "@/lib/theme";

function useDebounced<T>(value: T, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/** Full catalogue: search, category filter and the product grid. Home links here with ?category=. */
export default function ShopScreen() {
  const params = useLocalSearchParams<{ category?: string }>();
  const { width } = useWindowDimensions();
  const [query, setQuery] = useState("");
  const [categoryId, setCategoryId] = useState<number | undefined>(params.category ? Number(params.category) : undefined);
  const search = useDebounced(query.trim());

  // A category chosen on Home arrives as a param; follow it each time it changes.
  useEffect(() => {
    if (params.category !== undefined) {
      setCategoryId(params.category ? Number(params.category) : undefined);
      setQuery("");
    }
  }, [params.category]);

  const categories = useCategories();
  // The API searches across all categories; the category filter applies when not searching.
  const products = useProducts(search ? { search } : { categoryId });
  const cardWidth = (Math.min(width, 640) - spacing.md * 3) / 2;

  const header = (
    <View style={{ gap: spacing.md, paddingBottom: spacing.sm }}>
      <View style={s.searchBox}>
        <Ionicons name="search" size={18} color={colors.muted} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search groceries"
          placeholderTextColor={colors.muted}
          style={s.searchInput}
          returnKeyType="search"
          autoCorrect={false}
          accessibilityLabel="Search groceries"
        />
        {!!query && (
          <Pressable onPress={() => setQuery("")} hitSlop={8} accessibilityLabel="Clear search">
            <Ionicons name="close-circle" size={18} color={colors.muted} />
          </Pressable>
        )}
      </View>
      {!search && (
        <View style={{ marginHorizontal: -spacing.md }}>
          <CategoryBubbles categories={categories.data ?? []} selected={categoryId} onSelect={setCategoryId} />
        </View>
      )}
      {!!search && <Text style={s.section}>Results for "{search}"</Text>}
    </View>
  );

  if (products.isLoading) return <View style={{ padding: spacing.md, flex: 1 }}>{header}<Loading label="Loading products" /></View>;
  if (products.error && !products.data) {
    return <View style={{ padding: spacing.md, flex: 1 }}>{header}<ErrorState error={products.error} onRetry={() => void products.refetch()} /></View>;
  }

  return (
    <FlatList
      data={products.data}
      keyExtractor={(p) => String(p.id)}
      numColumns={2}
      ListHeaderComponent={header}
      columnWrapperStyle={{ gap: spacing.md }}
      contentContainerStyle={{ padding: spacing.md, gap: spacing.md, flexGrow: 1 }}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        <RefreshControl
          refreshing={products.isRefetching}
          onRefresh={() => void Promise.all([products.refetch(), categories.refetch()])}
          tintColor={colors.primary}
          colors={[colors.primary]}
        />
      }
      ListEmptyComponent={
        <EmptyState
          icon="search-outline"
          title={search ? "No matches" : "Nothing here yet"}
          body={search ? `We couldn't find "${search}". Try another word.` : "Check back soon."}
        />
      }
      renderItem={({ item }) => <ProductCard product={item} width={cardWidth} />}
    />
  );
}

const s = StyleSheet.create({
  searchBox: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.md,
    borderRadius: radius.pill, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
  },
  searchInput: { flex: 1, paddingVertical: 12, fontSize: 15, color: colors.text },
  section: { fontSize: 17, fontWeight: "700", color: colors.text },
});
