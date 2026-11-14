/**
 * One-off migration: Google Sheets -> PostgreSQL.
 *
 *   npx tsx scripts/migrate-sheets-to-pg.ts --dry-run   # read + validate + report only
 *   npx tsx scripts/migrate-sheets-to-pg.ts             # write (target tables must be empty)
 *
 * Sheets are read with a read-only scope and never modified. All writes happen in a
 * single transaction, so a failure leaves Postgres untouched. Rows referencing missing
 * users/products/orders are skipped and listed in the report.
 */
import "dotenv/config";
import { google } from "googleapis";
import { sql } from "drizzle-orm";
import { db, pool } from "../server/db.js";
import { users, categories, products, orders, orderItems, cartItems } from "../shared/schema.js";

const DRY_RUN = process.argv.includes("--dry-run");
const required = ["GOOGLE_SHEETS_CLIENT_EMAIL", "GOOGLE_SHEETS_PRIVATE_KEY", "GOOGLE_SHEETS_SPREADSHEET_ID"];
const missing = required.filter((k) => !process.env[k]);
if (missing.length) {
  console.error(`Missing env vars: ${missing.join(", ")}`);
  process.exit(1);
}

const auth = new google.auth.GoogleAuth({
  credentials: {
    client_email: process.env.GOOGLE_SHEETS_CLIENT_EMAIL,
    private_key: process.env.GOOGLE_SHEETS_PRIVATE_KEY!.replace(/\\n/g, "\n").replace(/"/g, ""),
  },
  scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
});
const sheets = google.sheets({ version: "v4", auth });

type Row = Record<string, string>;
async function readSheet(name: string): Promise<Row[]> {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.GOOGLE_SHEETS_SPREADSHEET_ID!,
    range: name,
  });
  const [headers, ...rows] = res.data.values ?? [];
  if (!headers) return [];
  return rows
    .filter((r) => r.some((c) => String(c ?? "").trim() !== ""))
    .map((r) => Object.fromEntries(headers.map((h: string, i: number) => [h, String(r[i] ?? "").trim()])));
}

const skipped: string[] = [];
const int = (v: string) => (/^\d+$/.test(v) ? parseInt(v, 10) : null);
const date = (v: string) => {
  const d = v ? new Date(v) : null;
  return d && !isNaN(d.getTime()) ? d : null;
};
const money = (v: string, ctx: string) => {
  const n = Number(String(v).replace(/[, ]/g, "").replace(/^UGX/i, ""));
  if (!Number.isFinite(n)) throw new Error(`Invalid money value "${v}" at ${ctx}`);
  return n.toFixed(2);
};
const str = (v: string) => (v === "" ? null : v);

async function main() {
  console.log(DRY_RUN ? "DRY RUN — no writes" : "LIVE RUN");
  const [uRows, cRows, pRows, oRows, oiRows, ciRows] = await Promise.all(
    ["users", "categories", "products", "orders", "order_items", "cart_items"].map(readSheet),
  );

  // --- users (dedupe on phone: keep first) ---
  const seenPhones = new Set<string>();
  const userVals = uRows.flatMap((r, i) => {
    if (!r.id || !r.phoneNumber) return skipped.push(`users row ${i + 2}: missing id/phone`), [];
    if (seenPhones.has(r.phoneNumber)) return skipped.push(`users row ${i + 2}: duplicate phone ${r.phoneNumber}`), [];
    seenPhones.add(r.phoneNumber);
    return [{
      id: r.id, phoneNumber: r.phoneNumber, firstName: str(r.firstName), lastName: str(r.lastName),
      isAdmin: r.isAdmin === "true", createdAt: date(r.createdAt), updatedAt: date(r.updatedAt),
    }];
  });
  const userIds = new Set(userVals.map((u) => u.id));

  const catVals = cRows.flatMap((r, i) => {
    const id = int(r.id);
    if (id === null || !r.name) return skipped.push(`categories row ${i + 2}: bad id/name`), [];
    return [{ id, name: r.name, icon: str(r.icon), createdAt: date(r.createdAt) }];
  });
  const catIds = new Set(catVals.map((c) => c.id));

  const prodVals = pRows.flatMap((r, i) => {
    const id = int(r.id);
    if (id === null || !r.name) return skipped.push(`products row ${i + 2}: bad id/name`), [];
    let categoryId = int(r.categoryId);
    if (categoryId !== null && !catIds.has(categoryId)) {
      skipped.push(`products ${id}: unknown category ${categoryId} (set to null)`);
      categoryId = null;
    }
    return [{
      id, name: r.name, description: str(r.description), price: money(r.price, `product ${id}`),
      image: str(r.image), categoryId, inStock: r.inStock !== "false",
      createdAt: date(r.createdAt), updatedAt: date(r.updatedAt),
    }];
  });
  const prodIds = new Set(prodVals.map((p) => p.id));

  const orderVals = oRows.flatMap((r, i) => {
    const id = int(r.id);
    if (id === null) return skipped.push(`orders row ${i + 2}: bad id`), [];
    if (!userIds.has(r.userId)) return skipped.push(`orders ${id}: unknown user ${r.userId}`), [];
    return [{
      id, userId: r.userId, status: r.status || "pending", total: money(r.total, `order ${id}`),
      customerEmail: str(r.customerEmail), customerPhone: str(r.customerPhone),
      deliveryAddress: str(r.deliveryAddress), notes: str(r.notes),
      createdAt: date(r.createdAt), updatedAt: date(r.updatedAt),
    }];
  });
  const orderIds = new Set(orderVals.map((o) => o.id));

  const lineVals = oiRows.flatMap((r, i) => {
    const id = int(r.id), orderId = int(r.orderId), productId = int(r.productId), quantity = int(r.quantity);
    if (id === null || orderId === null || productId === null || quantity === null)
      return skipped.push(`order_items row ${i + 2}: bad numeric field`), [];
    if (!orderIds.has(orderId)) return skipped.push(`order_items ${id}: unknown order ${orderId}`), [];
    if (!prodIds.has(productId)) return skipped.push(`order_items ${id}: unknown product ${productId}`), [];
    return [{ id, orderId, productId, quantity, price: money(r.price, `order_item ${id}`) }];
  });

  // cart: merge duplicates (user, product) by summing, matching addToCart semantics
  const cartMap = new Map<string, { userId: string; productId: number; quantity: number; createdAt: Date | null }>();
  ciRows.forEach((r, i) => {
    const productId = int(r.productId), quantity = int(r.quantity);
    if (productId === null || quantity === null || quantity <= 0) return skipped.push(`cart_items row ${i + 2}: bad field`);
    if (!userIds.has(r.userId) || !prodIds.has(productId))
      return skipped.push(`cart_items row ${i + 2}: unknown user/product`);
    const key = `${r.userId}:${productId}`;
    const ex = cartMap.get(key);
    if (ex) ex.quantity += quantity;
    else cartMap.set(key, { userId: r.userId, productId, quantity, createdAt: date(r.createdAt) });
  });
  const cartVals = Array.from(cartMap.values());

  // Source totals for reconciliation
  const sumOrders = (vals: { total: string }[]) => vals.reduce((s, o) => s + Number(o.total), 0).toFixed(2);
  const sumLines = (vals: { price: string; quantity: number }[]) =>
    vals.reduce((s, l) => s + Number(l.price) * l.quantity, 0).toFixed(2);

  // Flag orders whose header total disagrees with their lines (reported, not altered)
  const lineTotals = new Map<number, number>();
  lineVals.forEach((l) => lineTotals.set(l.orderId, (lineTotals.get(l.orderId) ?? 0) + Number(l.price) * l.quantity));
  orderVals.forEach((o) => {
    const lt = lineTotals.get(o.id);
    if (lt !== undefined && Math.abs(lt - Number(o.total)) > 0.005)
      skipped.push(`orders ${o.id}: total ${o.total} != line sum ${lt.toFixed(2)} (migrated as-is)`);
  });

  console.table({
    users: { sheet: uRows.length, migrate: userVals.length },
    categories: { sheet: cRows.length, migrate: catVals.length },
    products: { sheet: pRows.length, migrate: prodVals.length },
    orders: { sheet: oRows.length, migrate: orderVals.length },
    order_items: { sheet: oiRows.length, migrate: lineVals.length },
    cart_items: { sheet: ciRows.length, migrate: cartVals.length },
  });
  console.log(`Order total sum: ${sumOrders(orderVals)}   Line value sum: ${sumLines(lineVals)}`);
  if (skipped.length) console.log(`\nNotes / skipped (${skipped.length}):\n  ` + skipped.join("\n  "));
  if (DRY_RUN) return;

  const [{ n }] = (await db.execute<{ n: number }>(sql`
    select (select count(*) from users) + (select count(*) from categories) + (select count(*) from products)
         + (select count(*) from orders) + (select count(*) from order_items) + (select count(*) from cart_items) as n`)).rows;
  if (Number(n) > 0) throw new Error("Target tables are not empty; refusing to migrate. Truncate first if intended.");

  await db.transaction(async (tx) => {
    const chunk = async <T>(table: any, vals: T[]) => {
      for (let i = 0; i < vals.length; i += 500) await tx.insert(table).values(vals.slice(i, i + 500) as any);
    };
    await chunk(users, userVals);
    await chunk(categories, catVals);
    await chunk(products, prodVals);
    await chunk(orders, orderVals);
    await chunk(orderItems, lineVals);
    await chunk(cartItems, cartVals);
    for (const t of ["categories", "products", "orders", "order_items", "cart_items"]) {
      await tx.execute(sql.raw(
        `select setval(pg_get_serial_sequence('${t}','id'), coalesce((select max(id) from ${t}), 0) + 1, false)`));
    }

    // Reconcile inside the transaction; throwing rolls everything back.
    const r = (await tx.execute<Record<string, string>>(sql`
      select (select count(*) from users) u, (select count(*) from categories) c, (select count(*) from products) p,
             (select count(*) from orders) o, (select count(*) from order_items) oi, (select count(*) from cart_items) ci,
             (select coalesce(sum(total),0)::numeric(14,2) from orders) ot,
             (select coalesce(sum(price*quantity),0)::numeric(14,2) from order_items) lt`)).rows[0];
    const expected = {
      u: userVals.length, c: catVals.length, p: prodVals.length, o: orderVals.length,
      oi: lineVals.length, ci: cartVals.length, ot: sumOrders(orderVals), lt: sumLines(lineVals),
    };
    const mismatches = Object.entries(expected).filter(([k, v]) => String(r[k]) !== String(v));
    if (mismatches.length) throw new Error(`Reconciliation failed: ${JSON.stringify({ expected, actual: r })}`);
    console.log("Reconciliation OK:", r);
  });
  console.log("Migration committed.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
