import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CartItemResponse, CategoryResponse, ProductResponse } from "@shared/api";
import { api } from "./api";
import { useAuth } from "./auth";
import { authedApi } from "./session";

export const keys = {
  categories: ["categories"] as const,
  products: (f: { categoryId?: number; search?: string }) => ["products", f] as const,
  product: (id: number) => ["product", id] as const,
  cart: ["cart"] as const,
};

export function useCategories() {
  return useQuery({ queryKey: keys.categories, queryFn: () => api<CategoryResponse[]>("/categories") });
}

export function useProducts(filter: { categoryId?: number; search?: string }) {
  return useQuery({
    queryKey: keys.products(filter),
    queryFn: () => {
      const q = new URLSearchParams();
      if (filter.categoryId) q.set("categoryId", String(filter.categoryId));
      if (filter.search) q.set("search", filter.search);
      const qs = q.toString();
      return api<ProductResponse[]>(`/products${qs ? `?${qs}` : ""}`);
    },
    placeholderData: (prev) => prev,
  });
}

export function useProduct(id: number) {
  const client = useQueryClient();
  return useQuery({
    queryKey: keys.product(id),
    queryFn: () => api<ProductResponse>(`/products/${id}`),
    enabled: Number.isInteger(id) && id > 0,
    // Show list data instantly while the detail request revalidates.
    initialData: () =>
      client
        .getQueriesData<ProductResponse[]>({ queryKey: ["products"] })
        .flatMap(([, list]) => list ?? [])
        .find((p) => p.id === id),
  });
}

export function useCart() {
  const { status } = useAuth();
  return useQuery({
    queryKey: keys.cart,
    queryFn: () => authedApi<CartItemResponse[]>("/cart"),
    enabled: status === "signedIn",
  });
}

export function cartSummary(items: CartItemResponse[] | undefined) {
  const list = items ?? [];
  return {
    count: list.reduce((n, i) => n + i.quantity, 0),
    // Display only: the server recomputes the authoritative total at checkout.
    subtotal: list.reduce((s, i) => s + Math.round(Number(i.product.price) * 100) * i.quantity, 0) / 100,
  };
}

export function useAddToCart() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (v: { productId: number; quantity: number }) =>
      authedApi("/cart", { method: "POST", body: v }),
    onSettled: () => client.invalidateQueries({ queryKey: keys.cart }),
  });
}

/** Optimistic quantity change / removal with rollback on failure. */
function useOptimisticCart<V extends { productId: number }>(
  request: (v: V) => Promise<unknown>,
  apply: (items: CartItemResponse[], v: V) => CartItemResponse[],
) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: request,
    onMutate: async (v: V) => {
      await client.cancelQueries({ queryKey: keys.cart });
      const previous = client.getQueryData<CartItemResponse[]>(keys.cart);
      if (previous) client.setQueryData(keys.cart, apply(previous, v));
      return { previous };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.previous) client.setQueryData(keys.cart, ctx.previous);
    },
    onSettled: () => client.invalidateQueries({ queryKey: keys.cart }),
  });
}

export function useUpdateCartQuantity() {
  return useOptimisticCart<{ productId: number; quantity: number }>(
    ({ productId, quantity }) => authedApi(`/cart/${productId}`, { method: "PUT", body: { quantity } }),
    (items, v) => items.map((i) => (i.productId === v.productId ? { ...i, quantity: v.quantity } : i)),
  );
}

export function useRemoveFromCart() {
  return useOptimisticCart<{ productId: number }>(
    ({ productId }) => authedApi(`/cart/${productId}`, { method: "DELETE" }),
    (items, v) => items.filter((i) => i.productId !== v.productId),
  );
}
