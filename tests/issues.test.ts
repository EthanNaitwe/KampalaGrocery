/** The app's Issues section: list everything a customer reported; report with or without an order. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  V1, addAddress, app, captureCodes, cleanupUsers, openSlot, phones, placeOrder, pool, request, signIn as signInWith,
  staffSession, type StaffSession,
} from "./helpers.js";

const PREFIX = "+2567995";
const nextPhone = phones(PREFIX);
const { codes, restore } = captureCodes();
const signIn = () => signInWith(codes, nextPhone());

let productId: number;
let staff: StaffSession;

async function orderFor(u: Awaited<ReturnType<typeof signIn>>) {
  await request(app).post(`${V1}/cart`).set(u.h).send({ productId, quantity: 1 }).expect(201);
  const res = await placeOrder(u.h, { addressId: await addAddress(u.h), ...(await openSlot()) });
  expect(res.status).toBe(201);
  return res.body.id as number;
}
const report = (h: Record<string, string>, body: object) => request(app).post(`${V1}/support/issues`).set(h).send(body);

beforeAll(async () => {
  productId = (await pool.query("insert into products (name, price, in_stock) values ('TEST issues item', 1000, true) returning id")).rows[0].id;
  staff = await staffSession(PREFIX, "staff");
});

afterAll(async () => {
  restore();
  await pool.query("delete from cart_items where product_id = $1", [productId]);
  await cleanupUsers(PREFIX);
  await pool.query("delete from inventory_movements where product_id = $1", [productId]);
  await pool.query("delete from products where id = $1", [productId]);
  await pool.end();
});

describe("customer issues", () => {
  it("reports a general issue and an order issue, and lists both newest first", async () => {
    const u = await signIn();
    const orderId = await orderFor(u);
    const general = await report(u.h, { category: "other", message: "I can't change my delivery address" });
    expect(general.status).toBe(201);
    expect(general.body).toMatchObject({ orderId: null, status: "open" });
    const about = await report(u.h, { category: "missing_item", message: "No tomatoes in the bag", orderId });
    expect(about.status).toBe(201);
    expect(about.body.orderId).toBe(orderId);

    const list = (await request(app).get(`${V1}/support/issues`).set(u.h).expect(200)).body;
    expect(list.map((i: { id: number }) => i.id)).toEqual([about.body.id, general.body.id]);
    // The order-specific list still works.
    const forOrder = (await request(app).get(`${V1}/orders/${orderId}/issues`).set(u.h)).body;
    expect(forOrder.map((i: { id: number }) => i.id)).toEqual([about.body.id]);
  });

  it("shows only the caller's issues and refuses other people's orders", async () => {
    const a = await signIn();
    const b = await signIn();
    const aOrder = await orderFor(a);
    await report(a.h, { category: "late", message: "Rider was two hours late", orderId: aOrder }).expect(201);
    expect((await report(b.h, { category: "late", message: "Not my order at all", orderId: aOrder })).status).toBe(404);
    expect((await request(app).get(`${V1}/support/issues`).set(b.h)).body).toEqual([]);
  });

  it("shows the staff reply once resolved, and staff see general issues with the account phone", async () => {
    const u = await signIn();
    const issue = (await report(u.h, { category: "payment", message: "Charged twice for delivery" })).body;
    const queue = (await request(app).get(`${V1}/admin/issues?status=open`).set(staff.h).expect(200)).body;
    expect(queue.find((i: { id: number }) => i.id === issue.id)).toMatchObject({ orderId: null, customerPhone: u.phone });

    await request(app).patch(`${V1}/admin/issues/${issue.id}`).set(staff.h)
      .send({ status: "resolved", resolution: "Refunded UGX 5,000 by Mobile Money" }).expect(200);
    const mine = (await request(app).get(`${V1}/support/issues`).set(u.h)).body[0];
    expect(mine).toMatchObject({ status: "resolved", resolution: "Refunded UGX 5,000 by Mobile Money" });
  });

  it("validates and needs sign-in", async () => {
    const u = await signIn();
    expect((await report(u.h, { category: "nonsense", message: "hello there" })).status).toBe(400);
    expect((await report(u.h, { category: "other", message: "hi" })).status).toBe(400);
    expect((await request(app).get(`${V1}/support/issues`)).status).toBe(401);
    expect((await request(app).post(`${V1}/support/issues`).send({ category: "other", message: "hello there" })).status).toBe(401);
  });
});
