/** Owner management of product categories (staff console). */
import { asc, eq, sql } from "drizzle-orm";
import type { z } from "zod";
import { db } from "./db.js";
import { HttpError } from "./http.js";
import { categories } from "../shared/schema.js";
import type { AdminCategory, categoryBody, categoryPatchBody } from "../shared/api.js";

const duplicateName = (e: any): never => {
  if (e?.code === "23505") throw new HttpError("CONFLICT", "There's already a category with that name");
  throw e;
};

export async function listCategoriesWithCounts(): Promise<AdminCategory[]> {
  const rows = await db
    .select({
      id: categories.id,
      name: categories.name,
      icon: categories.icon,
      sortOrder: categories.sortOrder,
      createdAt: categories.createdAt,
      // Qualified explicitly: a bare "id" inside the subquery would mean products.id.
      productCount: sql<number>`(select count(*)::int from products p where p.category_id = "categories"."id")`,
    })
    .from(categories)
    .orderBy(asc(categories.sortOrder), asc(categories.id));
  return rows;
}

/** New categories go to the end of the list. */
export async function createCategory(body: z.infer<typeof categoryBody>) {
  const [row] = await db
    .insert(categories)
    .values({
      name: body.name,
      icon: body.icon || null,
      sortOrder: sql`(select coalesce(max(sort_order), 0) + 1 from categories)`,
    })
    .returning()
    .catch(duplicateName);
  return row;
}

export async function updateCategory(id: number, body: z.infer<typeof categoryPatchBody>) {
  const [row] = await db
    .update(categories)
    .set({ ...(body.name !== undefined && { name: body.name }), ...(body.icon !== undefined && { icon: body.icon || null }) })
    .where(eq(categories.id, id))
    .returning()
    .catch(duplicateName);
  if (!row) throw new HttpError("NOT_FOUND", "Category not found");
  return row;
}

/** Only empty categories can go; products would otherwise lose their place in the app. */
export async function deleteCategory(id: number) {
  await db.transaction(async (tx) => {
    const [c] = await tx.select().from(categories).where(eq(categories.id, id)).for("update");
    if (!c) throw new HttpError("NOT_FOUND", "Category not found");
    const { rows } = await tx.execute<{ n: number }>(sql`select count(*)::int as n from products where category_id = ${id}`);
    const n = Number(rows[0].n);
    if (n > 0) {
      throw new HttpError(
        "CONFLICT",
        `${n} product${n === 1 ? " is" : "s are"} still in "${c.name}". Move ${n === 1 ? "it" : "them"} to another category first.`,
        { productCount: n },
      );
    }
    await tx.delete(categories).where(eq(categories.id, id));
  });
}

/** Sets the app order. `ids` must list every category exactly once. */
export async function reorderCategories(ids: number[]) {
  return db.transaction(async (tx) => {
    const current = await tx.select({ id: categories.id }).from(categories).for("update");
    const known = new Set(current.map((c) => c.id));
    if (new Set(ids).size !== ids.length || ids.length !== known.size || !ids.every((id) => known.has(id))) {
      throw new HttpError("CONFLICT", "The category list changed. Refresh and try again.");
    }
    for (let i = 0; i < ids.length; i++) {
      await tx.update(categories).set({ sortOrder: i + 1 }).where(eq(categories.id, ids[i]));
    }
  });
}
