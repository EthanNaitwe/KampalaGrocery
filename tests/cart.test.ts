import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { app } from "../server/index.js";
import { pool } from "../server/db.js";

const V1 = "/api/v1";
const PREFIX = "+2567991";
let seq = Math.floor(Math.random() * 10000);
const codes = new Map<string, string>();
const logSpy = vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
  const m = String(args[0]).match(/verification code for (\S+): (\d+)/);
  if (m) codes.set(m[1], m[2]);
});

async function signIn() {
  const phone = `${PREFIX}${String(seq++).padStart(5, "0")}`;
  await request(app).post(`${V1}/auth/otp`).send({ phoneNumber: phone }).expect(200);
  const res = await request(app).post(`${V1}/auth/token`).send({ phoneNumber: phone, otp: codes.get(phone) }).expect(200);
  return { Authorization: `Bearer ${res.body.accessToken}` };
}

let productId: number;
let outOfStockId: number;
beforeAll(async () => {
  productId = (await pool.query("select id from products where in_stock is not false order by id limit 1")).rows[0].id;
  const { rows } = await pool.query(
    "insert into products (name, price, in_stock) values ('Test out-of-stock item', 1000, false) returning id",
  );
  outOfStockId = rows[0].id;
});

afterAll(async () => {
  logSpy.mockRestore();
  const ids = (await pool.query("select id from users where phone_number like $1", [`${PREFIX}%`])).rows.map((r) => r.id);
  await pool.query("delete from cart_items where user_id = any($1) or product_id = $2", [ids, outOfStockId]);
  await pool.query("delete from users where id = any($1)", [ids]);
  await pool.query("delete from otp_verifications where phone_number like $1", [`${PREFIX}%`]);
  await pool.query("delete from products where id = $1", [outOfStockId]);
  await pool.end();
});

describe("Cart", () => {
  it("persists server-side: add, merge, update, remove", async () => {
    const h = await signIn();
    await request(app).post(`${V1}/cart`).set(h).send({ productId, quantity: 2 }).expect(201);
    await request(app).post(`${V1}/cart`).set(h).send({ productId, quantity: 3 }).expect(201);
    let cart = (await request(app).get(`${V1}/cart`).set(h).expect(200)).body;
    expect(cart).toHaveLength(1);
    expect(cart[0].quantity).toBe(5);
    expect(cart[0].product.id).toBe(productId);

    await request(app).put(`${V1}/cart/${productId}`).set(h).send({ quantity: 7 }).expect(204);
    cart = (await request(app).get(`${V1}/cart`).set(h).expect(200)).body;
    expect(cart[0].quantity).toBe(7);

    await request(app).delete(`${V1}/cart/${productId}`).set(h).expect(204);
    expect((await request(app).get(`${V1}/cart`).set(h).expect(200)).body).toHaveLength(0);
  });

  it("caps merged quantity at 99", async () => {
    const h = await signIn();
    await request(app).post(`${V1}/cart`).set(h).send({ productId, quantity: 60 }).expect(201);
    await request(app).post(`${V1}/cart`).set(h).send({ productId, quantity: 60 }).expect(201);
    expect((await request(app).get(`${V1}/cart`).set(h)).body[0].quantity).toBe(99);
  });

  it("rejects invalid quantities and out-of-stock products", async () => {
    const h = await signIn();
    for (const quantity of [0, -1, 100, 1.5, "2"]) {
      expect((await request(app).post(`${V1}/cart`).set(h).send({ productId, quantity })).status).toBe(400);
    }
    const res = await request(app).post(`${V1}/cart`).set(h).send({ productId: outOfStockId, quantity: 1 });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("CONFLICT");
  });

  it("carts are isolated per user", async () => {
    const a = await signIn();
    const b = await signIn();
    await request(app).post(`${V1}/cart`).set(a).send({ productId, quantity: 1 }).expect(201);
    expect((await request(app).get(`${V1}/cart`).set(b)).body).toHaveLength(0);
    // B removing A's product affects only B's (empty) cart.
    await request(app).delete(`${V1}/cart/${productId}`).set(b).expect(204);
    expect((await request(app).get(`${V1}/cart`).set(a)).body).toHaveLength(1);
  });

  it("orders are refused when the cart contains out-of-stock items", async () => {
    const h = await signIn();
    await request(app).post(`${V1}/cart`).set(h).send({ productId, quantity: 1 }).expect(201);
    const userId = (await request(app).get(`${V1}/auth/me`).set(h)).body.id;
    await pool.query("insert into cart_items (user_id, product_id, quantity) values ($1, $2, 1)", [userId, outOfStockId]);
    const res = await request(app).post(`${V1}/orders`).set(h).send({});
    expect(res.status).toBe(409);
    expect(res.body.error.details.productIds).toEqual([outOfStockId]);
  });
});
