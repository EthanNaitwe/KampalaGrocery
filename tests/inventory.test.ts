import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  V1, addAddress, app, captureCodes, cleanupUsers, staffSession, type StaffSession, openSlot, phones, placeOrder, pool, request,
  signIn as signInWith,
} from "./helpers.js";

const PREFIX = "+2567993";
const nextPhone = phones(PREFIX);
const { codes, restore } = captureCodes();
const signIn = () => signInWith(codes, nextPhone());

let productId: number;
let admin: StaffSession;
const stockOf = async () => (await pool.query("select stock_quantity from products where id = $1", [productId])).rows[0].stock_quantity;
const setStock = (set: number) =>
  request(app).post(`${V1}/products/${productId}/stock`).set(admin.h).send({ set, reason: "count" });

beforeAll(async () => {
  productId = (await pool.query("insert into products (name, price, in_stock) values ('TEST stocked item', 2000, true) returning id")).rows[0].id;
  admin = await staffSession(PREFIX);
});

afterAll(async () => {
  restore();
  await pool.query("delete from cart_items where product_id = $1", [productId]);
  await cleanupUsers(PREFIX);
  await pool.query("delete from inventory_movements where product_id = $1", [productId]);
  await pool.query("delete from products where id = $1", [productId]);
  await pool.end();
});

describe("Stock management", () => {
  it("staff record counts, deliveries and write-offs in a ledger", async () => {
    expect((await setStock(10)).body.stockQuantity).toBe(10);
    const add = await request(app).post(`${V1}/products/${productId}/stock`).set(admin.h).send({ delta: 5, reason: "restock", note: "Supplier delivery" });
    expect(add.body.stockQuantity).toBe(15);
    const off = await request(app).post(`${V1}/products/${productId}/stock`).set(admin.h).send({ delta: -3, reason: "adjustment", note: "Damaged" });
    expect(off.body.stockQuantity).toBe(12);

    const moves = (await request(app).get(`${V1}/products/${productId}/stock-movements`).set(admin.h).expect(200)).body;
    expect(moves.slice(0, 3).map((m: { delta: number; balance: number; reason: string }) => [m.reason, m.delta, m.balance])).toEqual([
      ["adjustment", -3, 12], ["restock", 5, 15], ["count", 10, 10],
    ]);
  });

  it("stock can't go negative and only staff can change it", async () => {
    await setStock(2);
    expect((await request(app).post(`${V1}/products/${productId}/stock`).set(admin.h).send({ delta: -3, reason: "adjustment" })).status).toBe(400);
    expect(await stockOf()).toBe(2);
    const customer = await signIn();
    expect((await request(app).post(`${V1}/products/${productId}/stock`).set(customer.h).send({ set: 99, reason: "count" })).status).toBe(401);
  });

  it("product edits can't bypass the ledger", async () => {
    await setStock(4);
    await request(app).put(`${V1}/products/${productId}`).set(admin.h).send({ stockQuantity: 999, price: "2000" }).expect(200);
    expect(await stockOf()).toBe(4);
  });
});

describe("Stock in the cart and at checkout", () => {
  it("cart quantities are limited to available stock", async () => {
    await setStock(3);
    const u = await signIn();
    await request(app).post(`${V1}/cart`).set(u.h).send({ productId, quantity: 2 }).expect(201);
    const over = await request(app).post(`${V1}/cart`).set(u.h).send({ productId, quantity: 2 });
    expect(over.status).toBe(409);
    expect(over.body.message).toMatch(/Only 3/);
    expect((await request(app).put(`${V1}/cart/${productId}`).set(u.h).send({ quantity: 4 })).status).toBe(409);
    await request(app).put(`${V1}/cart/${productId}`).set(u.h).send({ quantity: 3 }).expect(204);
  });

  it("placing an order deducts stock; cancelling puts it back", async () => {
    await setStock(5);
    const u = await signIn();
    await request(app).post(`${V1}/cart`).set(u.h).send({ productId, quantity: 2 }).expect(201);
    const order = await placeOrder(u.h, { addressId: await addAddress(u.h), ...(await openSlot()) });
    expect(order.status).toBe(201);
    expect(await stockOf()).toBe(3);

    await request(app).post(`${V1}/orders/${order.body.id}/cancel`).set(u.h).expect(200);
    expect(await stockOf()).toBe(5);
    const { rows } = await pool.query(
      "select reason, delta from inventory_movements where order_id = $1 order by id",
      [order.body.id],
    );
    expect(rows).toEqual([{ reason: "order", delta: -2 }, { reason: "order_cancelled", delta: 2 }]);
  });

  it("the quote flags carts that exceed stock after it dropped", async () => {
    await setStock(5);
    const u = await signIn();
    await request(app).post(`${V1}/cart`).set(u.h).send({ productId, quantity: 4 }).expect(201);
    await setStock(1);
    const addressId = await addAddress(u.h);
    const q = (await request(app).post(`${V1}/checkout/quote`).set(u.h).send({ addressId })).body;
    expect(q.issues[0]).toMatchObject({ code: "OUT_OF_STOCK" });
    expect(q.issues[0].message).toMatch(/Only 1/);
    const res = await placeOrder(u.h, { addressId, ...(await openSlot()) });
    expect(res.status).toBe(409);
    expect(await stockOf()).toBe(1);
  });

  it("concurrent orders never sell more than is in stock", async () => {
    await setStock(5);
    const users = await Promise.all([signIn(), signIn(), signIn()]);
    const addrs = await Promise.all(
      users.map(async (u) => {
        await request(app).post(`${V1}/cart`).set(u.h).send({ productId, quantity: 2 }).expect(201);
        return addAddress(u.h);
      }),
    );
    const slot = await openSlot();
    const results = await Promise.all(users.map((u, i) => placeOrder(u.h, { addressId: addrs[i], ...slot })));
    expect(results.filter((r) => r.status === 201)).toHaveLength(2); // 2 + 2 <= 5; the third needs 2 of 1 left
    expect(results.filter((r) => r.status === 409)).toHaveLength(1);
    expect(await stockOf()).toBe(1);
    const { rows } = await pool.query("select coalesce(sum(delta), 0) as net from inventory_movements where product_id = $1 and reason = 'order'", [productId]);
    expect(Number(rows[0].net)).toBeLessThanOrEqual(-4);
  });
});

describe("Web ordering", () => {
  it("the legacy web order endpoint is retired", async () => {
    const u = await signIn();
    const res = await request(app).post("/api/orders").set(u.h).send({});
    expect(res.status).toBe(410);
    expect(res.body.error.code).toBe("GONE");
  });
});
