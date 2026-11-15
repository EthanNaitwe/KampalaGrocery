/**
 * Stock tracking. `products.stock_quantity` is the balance; `inventory_movements` is the ledger.
 * All changes lock the product row so concurrent orders and adjustments can't oversell.
 * Lock order is always product id ascending to avoid deadlocks.
 */
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "./db.js";
import { inventoryMovements, products, type Product } from "../shared/schema.js";
import { HttpError } from "./http.js";
import { sellableQuantity } from "../shared/api.js";

export { sellableQuantity };

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Exec = typeof db | Tx;

export const isSellable = (p: Pick<Product, "inStock" | "stockQuantity">) => sellableQuantity(p) > 0;

async function lockProducts(tx: Tx, ids: number[]) {
  const sorted = Array.from(new Set(ids)).sort((a, b) => a - b);
  if (sorted.length === 0) return new Map<number, Product>();
  const rows = await tx.select().from(products).where(inArray(products.id, sorted)).orderBy(products.id).for("update");
  return new Map(rows.map((r) => [r.id, r]));
}

export interface Shortage {
  productId: number;
  name: string;
  requested: number;
  available: number;
}

/**
 * Deducts stock for an order inside the caller's transaction. Throws CONFLICT with the
 * shortages if any line can't be fulfilled. Untracked products (NULL stock) are not deducted.
 */
/** Who made a change: the customer (their own order) or a staff member in the console. */
export type Actor = { userId: string } | { adminId: string };
export const actorCols = (a: Actor) => ({
  actorUserId: "userId" in a ? a.userId : null,
  actorAdminId: "adminId" in a ? a.adminId : null,
});

export async function deductForOrder(
  tx: Tx,
  lines: Array<{ productId: number; quantity: number }>,
  orderId: number,
  actorUserId: string,
) {
  const locked = await lockProducts(tx, lines.map((l) => l.productId));
  const shortages: Shortage[] = [];
  for (const l of lines) {
    const p = locked.get(l.productId);
    const available = p ? sellableQuantity(p) : 0;
    if (available < l.quantity) {
      shortages.push({ productId: l.productId, name: p?.name ?? "Item", requested: l.quantity, available: Number.isFinite(available) ? available : 0 });
    }
  }
  if (shortages.length) {
    throw new HttpError("CONFLICT", shortageMessage(shortages), { productIds: shortages.map((s) => s.productId), shortages });
  }

  for (const l of lines) {
    const p = locked.get(l.productId)!;
    if (p.stockQuantity == null) continue;
    const balance = p.stockQuantity - l.quantity;
    await tx.update(products).set({ stockQuantity: balance, updatedAt: new Date() }).where(eq(products.id, p.id));
    await tx.insert(inventoryMovements).values({ productId: p.id, delta: -l.quantity, balance, reason: "order", orderId, actorUserId });
  }
}

/** Returns exactly what this order deducted (from the ledger), e.g. on cancellation. Idempotent. */
export async function restockForOrder(tx: Tx, orderId: number, actor: Actor) {
  const { rows } = await tx.execute<{ product_id: number; net: string }>(sql`
    select product_id, sum(delta) as net from inventory_movements
    where order_id = ${orderId} and reason in ('order', 'order_cancelled')
    group by product_id having sum(delta) < 0`);
  if (rows.length === 0) return;
  const locked = await lockProducts(tx, rows.map((r) => r.product_id));
  for (const r of rows) {
    const p = locked.get(r.product_id);
    if (!p) continue;
    const qty = -Number(r.net);
    const balance = (p.stockQuantity ?? 0) + qty;
    await tx.update(products).set({ stockQuantity: balance, updatedAt: new Date() }).where(eq(products.id, p.id));
    await tx.insert(inventoryMovements).values({
      productId: p.id, delta: qty, balance, reason: "order_cancelled", orderId, ...actorCols(actor),
    });
  }
}

/**
 * Staff stock change. `set` records a physical count (absolute); `delta` records a delivery
 * from a supplier (+) or a write-off (-). Balance can never go below zero.
 */
export async function adjustStock(
  productId: number,
  change: { set: number } | { delta: number },
  reason: "count" | "restock" | "adjustment",
  actor: Actor,
  note?: string,
) {
  return db.transaction(async (tx) => {
    const p = (await lockProducts(tx, [productId])).get(productId);
    if (!p) throw new HttpError("NOT_FOUND", "Product not found");
    const current = p.stockQuantity ?? 0;
    const balance = "set" in change ? change.set : current + change.delta;
    if (balance < 0) throw new HttpError("VALIDATION_ERROR", `Stock can't go below zero (currently ${current})`);
    const delta = p.stockQuantity == null && "set" in change ? balance : balance - current;
    const [updated] = await tx.update(products).set({ stockQuantity: balance, updatedAt: new Date() }).where(eq(products.id, productId)).returning();
    await tx.insert(inventoryMovements).values({ productId, delta, balance, reason, ...actorCols(actor), note: note ?? null });
    return updated;
  });
}

export async function listMovements(productId: number, limit = 50) {
  return db
    .select()
    .from(inventoryMovements)
    .where(and(eq(inventoryMovements.productId, productId)))
    .orderBy(sql`${inventoryMovements.id} desc`)
    .limit(limit);
}

export function shortageMessage(shortages: Shortage[]) {
  return shortages
    .map((s) => (s.available === 0 ? `${s.name} is out of stock` : `Only ${s.available} ${s.name} left`))
    .join("; ");
}

/** Validates a cart quantity against current stock (no lock; the order step re-checks under lock). */
export function assertCartQuantity(p: Product, quantity: number) {
  const available = sellableQuantity(p);
  if (available <= 0) throw new HttpError("CONFLICT", `${p.name} is out of stock`);
  if (quantity > available) {
    throw new HttpError("CONFLICT", `Only ${available} ${p.name} left`, { productId: p.id, available });
  }
}

export type { Exec };
