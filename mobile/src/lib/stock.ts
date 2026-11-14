import { LOW_STOCK_THRESHOLD, sellableQuantity } from "@shared/api";
import type { ProductResponse } from "@shared/api";

export { sellableQuantity };

/** Customer-facing availability text, or null when there's nothing worth saying. */
export function stockLabel(p: Pick<ProductResponse, "inStock" | "stockQuantity">): { text: string; out: boolean } | null {
  const n = sellableQuantity(p);
  if (n <= 0) return { text: "Out of stock", out: true };
  if (Number.isFinite(n) && n <= LOW_STOCK_THRESHOLD) return { text: `Only ${n} left`, out: false };
  return null;
}
