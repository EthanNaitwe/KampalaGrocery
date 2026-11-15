import Ionicons from "@expo/vector-icons/Ionicons";
import { Link } from "expo-router";
import { useEffect, useState } from "react";
import { FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { ProductImage } from "@/components/ProductImage";
import { EmptyState, ErrorState, Loading } from "@/components/States";
import { useCategories, useProducts } from "@/lib/queries";
import { stockLabel } from "@/lib/stock";
import { colors, formatUGX, spacing } from "@/lib/theme";

function useDebounced<T>(value: T, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export default function ShopScreen() {
  const [query, setQuery] = useState("");
  const [categoryId, setCategoryId] = useState<number | undefined>();
  const search = useDebounced(query.trim());

  const categories = useCategories();
  // The API applies search across all categories; the category filter applies when not searching.
  const products = useProducts(search ? { search } : { categoryId });

  return (
    <View style={{ flex: 1 }}>
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
          clearButtonMode="while-editing"
        />
        {!!query && (
          <Pressable onPress={() => setQuery("")} hitSlop={8} accessibilityLabel="Clear search">
            <Ionicons name="close-circle" size={18} color={colors.muted} />
          </Pressable>
        )}
      </View>

      {!search && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chips} style={{ flexGrow: 0 }}>
          {[{ id: undefined, name: "All", icon: null }, ...(categories.data ?? [])].map((c) => {
            const active = c.id === categoryId;
            return (
              <Pressable
                key={c.id ?? "all"}
                onPress={() => setCategoryId(c.id)}
                style={[s.chip, active && s.chipActive]}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
              >
                <Text style={[s.chipText, active && { color: "#fff" }]}>
                  {c.icon ? `${c.icon} ` : ""}
                  {c.name}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      )}

      {products.isLoading ? (
        <Loading label="Loading products" />
      ) : products.error && !products.data ? (
        <ErrorState error={products.error} onRetry={() => void products.refetch()} />
      ) : (
        <FlatList
          data={products.data}
          keyExtractor={(p) => String(p.id)}
          contentContainerStyle={{ padding: spacing.md, gap: spacing.sm, flexGrow: 1 }}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl
              refreshing={products.isRefetching}
              onRefresh={() => void Promise.all([products.refetch(), categories.refetch()])}
              tintColor={colors.primary}
            />
          }
          ListEmptyComponent={
            <EmptyState
              title={search ? "No matches" : "Nothing here yet"}
              body={search ? `We couldn't find "${search}". Try another word.` : "Check back soon."}
            />
          }
          renderItem={({ item }) => {
            const stock = stockLabel(item);
            return (
            <Link href={{ pathname: "/product/[id]", params: { id: String(item.id) } }} asChild>
              <Pressable
                style={({ pressed }) => [s.card, pressed && { opacity: 0.7 }]}
                accessibilityRole="button"
                accessibilityLabel={`${item.name}, ${formatUGX(item.price)}${stock ? `, ${stock.text}` : ""}`}
              >
                <ProductImage uri={item.image} size={72} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={s.name} numberOfLines={2}>{item.name}</Text>
                  {!!item.description && <Text style={s.desc} numberOfLines={1}>{item.description}</Text>}
                  <Text style={s.price}>{formatUGX(item.price)}</Text>
                  {!!stock && <Text style={stock.out ? s.out : s.low}>{stock.text}</Text>}
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.muted} />
              </Pressable>
            </Link>
            );
          }}
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    margin: spacing.md,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  searchInput: { flex: 1, paddingVertical: 10, fontSize: 16, color: colors.text },
  chips: { paddingHorizontal: spacing.md, gap: spacing.sm, paddingBottom: spacing.xs },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { color: colors.text, fontWeight: "500" },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  name: { fontSize: 16, fontWeight: "600", color: colors.text },
  desc: { fontSize: 13, color: colors.muted },
  price: { marginTop: 2, color: colors.primary, fontWeight: "700" },
  out: { color: colors.danger, fontSize: 13, fontWeight: "600" },
  low: { color: "#b45309", fontSize: 13, fontWeight: "600" },
});
