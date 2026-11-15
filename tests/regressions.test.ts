/** Regression tests for issues found in the post-Phase-5 review. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { normalizePhoneNumber } from "../server/smsAuth.js";
import {
  V1, addAddress, agreeTransport, app, captureCodes, cleanupUsers, staffSession, type StaffSession, openSlot, phones, placeOrder, pool, request,
  signIn as signInWith,
} from "./helpers.js";

const PREFIX = "+2567995";
const nextPhone = phones(PREFIX);
const { codes, restore } = captureCodes();
const signIn = () => signInWith(codes, nextPhone());

let productId: number;
let staff: StaffSession;

async function order(u: Awaited<ReturnType<typeof signIn>>, quantity = 1) {
  await request(app).post(`${V1}/cart`).set(u.h).send({ productId, quantity }).expect(201);
  const res = await placeOrder(u.h, { addressId: await addAddress(u.h), ...(await openSlot()), extra: { notes: "Call me on arrival" } });
  expect(res.status).toBe(201);
  return res.body as { id: number };
}

beforeAll(async () => {
  productId = (await pool.query("insert into products (name, price, in_stock, stock_quantity) values ('TEST regression item', 1500, true, 50) returning id")).rows[0].id;
  staff = await staffSession(PREFIX);
});

afterAll(async () => {
  restore();
  await pool.query("delete from cart_items where product_id = $1", [productId]);
  // Deleted accounts no longer match the phone prefix; clean them up via their orders' product.
  const deleted = (await pool.query(
    "select distinct o.user_id from orders o join order_items oi on oi.order_id = o.id where oi.product_id = $1",
    [productId],
  )).rows.map((r) => r.user_id);
  if (deleted.length) {
    await pool.query("update users set phone_number = $1 || id where id = any($2) and phone_number like 'deleted:%'", [`${PREFIX}x`, deleted]);
  }
  await cleanupUsers(PREFIX);
  await pool.query("delete from inventory_movements where product_id = $1", [productId]);
  await pool.query("delete from products where id = $1", [productId]);
  await pool.end();
});

describe("Account deletion removes personal data", () => {
  it("is refused while an order is in progress", async () => {
    const u = await signIn();
    await order(u);
    const res = await request(app).delete(`${V1}/auth/account`).set(u.h);
    expect(res.status).toBe(409);
    expect((await request(app).get(`${V1}/auth/me`).set(u.h)).status).toBe(200);
  });

  it("scrubs orders, addresses, texts and issues but keeps order totals", async () => {
    const u = await signIn();
    const o = await order(u, 2);
    await request(app).post(`${V1}/orders/${o.id}/issues`).set(u.h).send({ category: "late", message: "My phone is 0772 999999" }).expect(201);
    await request(app).post(`${V1}/orders/${o.id}/cancel`).set(u.h).expect(200);
    await request(app).delete(`${V1}/auth/account`).set(u.h).expect(204);

    const { rows: [row] } = await pool.query(
      "select customer_name, customer_phone, customer_email, delivery_address, delivery_instructions, notes, total from orders where id = $1",
      [o.id],
    );
    expect(row).toMatchObject({
      customer_name: null, customer_phone: null, customer_email: null,
      delivery_address: null, delivery_instructions: null, notes: null,
    });
    expect(Number(row.total)).toBeGreaterThan(0);
    expect((await pool.query("select count(*) from addresses where user_id = $1", [u.userId])).rows[0].count).toBe("0");
    const texts = (await pool.query("select recipient, body from notifications where user_id = $1", [u.userId])).rows;
    expect(texts.every((t) => t.recipient === null && !t.body.includes(u.phone))).toBe(true);
    const issues = (await pool.query("select message from support_issues where user_id = $1", [u.userId])).rows;
    expect(issues.every((i) => !i.message.includes("0772"))).toBe(true);
    expect((await pool.query("select count(*) from otp_verifications where phone_number = $1", [u.phone])).rows[0].count).toBe("0");
  });
});

describe("Order access", () => {
  it("GET /orders returns only the caller's own orders; staff use the queue", async () => {
    const customer = await signIn();
    const other = await signIn();
    const o = await order(customer);
    const mine = (await request(app).get(`${V1}/orders`).set(other.h).expect(200)).body;
    expect(mine.map((x: { id: number }) => x.id)).not.toContain(o.id);
    // A staff console session is not a customer session.
    expect((await request(app).get(`${V1}/orders`).set(staff.h)).status).toBe(401);
    // Staff still see it in the queue.
    const queue = (await request(app).get(`${V1}/admin/orders?status=all&q=${o.id}`).set(staff.h)).body;
    expect(queue.items.map((x: { id: number }) => x.id)).toContain(o.id);
  });
});

describe("Failed deliveries", () => {
  it("staff can cancel an order that's out for delivery, and stock is returned", async () => {
    const u = await signIn();
    const before = (await pool.query("select stock_quantity from products where id = $1", [productId])).rows[0].stock_quantity;
    const o = await order(u, 3);
    for (const s of ["confirmed", "preparing"]) {
      await request(app).put(`${V1}/orders/${o.id}/status`).set(staff.h).send({ status: s }).expect(200);
    }
    await agreeTransport(staff.h, o.id).expect(200);
    await request(app).put(`${V1}/orders/${o.id}/status`).set(staff.h).send({ status: "out_for_delivery" }).expect(200);
    const res = await request(app).put(`${V1}/orders/${o.id}/status`).set(staff.h).send({ status: "cancelled", note: "Customer not home" });
    expect(res.status).toBe(200);
    expect(res.body.paymentStatus).toBe("void");
    expect((await pool.query("select stock_quantity from products where id = $1", [productId])).rows[0].stock_quantity).toBe(before);
  });
});

describe("Products with history", () => {
  it("can't be deleted (409 with guidance), only switched off sale", async () => {
    const u = await signIn();
    await order(u);
    const res = await request(app).delete(`${V1}/products/${productId}`).set(staff.h);
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/off sale/);
  });
});

describe("Phone numbers", () => {
  it("normalises Ugandan numbers typed without the leading 0", () => {
    expect(normalizePhoneNumber("772123456")).toBe("+256772123456");
    expect(normalizePhoneNumber("0772 123 456")).toBe("+256772123456");
    expect(normalizePhoneNumber("256772123456")).toBe("+256772123456");
    expect(normalizePhoneNumber("+44 7700 900123")).toBe("+447700900123");
  });
});

describe("Logging", () => {
  it("the access log never contains response bodies", async () => {
    const lines: string[] = [];
    const orig = console.log;
    console.log = (...a: unknown[]) => { lines.push(a.map(String).join(" ")); orig(...a); };
    try {
      const phone = nextPhone();
      await request(app).post(`${V1}/auth/otp`).send({ phoneNumber: phone }).expect(200);
      const res = await request(app).post(`${V1}/auth/token`).send({ phoneNumber: phone, otp: codes.get(phone) }).expect(200);
      const access = lines.filter((l) => l.includes("[express]"));
      expect(access.some((l) => l.includes("POST /api/v1/auth/token 200"))).toBe(true);
      expect(access.some((l) => l.includes(res.body.accessToken.slice(0, 20)) || l.includes(phone))).toBe(false);
    } finally {
      console.log = orig;
    }
  });
});
