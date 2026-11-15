import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "crypto";
import { kampalaDate } from "../server/checkout.js";
import {
  V1,
  addAddress,
  app,
  captureCodes,
  cleanupUsers,
  staffSession,
  openSlot,
  phones,
  placeOrder,
  pool,
  request,
  signIn as signInWith,
} from "./helpers.js";

const PREFIX = "+2567992";
const nextPhone = phones(PREFIX);
const { codes, restore } = captureCodes();
const signIn = () => signInWith(codes, nextPhone());

let productId: number;
let price: number;
let tinySlotId: number; // capacity 1
let closedSlotId: number; // starts at 00:00, so today's window is always closed
let pricyZoneId: number; // minimum order far above any test cart

async function fillCart(h: Record<string, string>, quantity = 2) {
  await request(app).post(`${V1}/cart`).set(h).send({ productId, quantity }).expect(201);
}

beforeAll(async () => {
  // Remove leftovers from an aborted earlier run.
  await pool.query("delete from delivery_slots where label like 'TEST %' and id not in (select slot_id from orders where slot_id is not null)");
  await pool.query("delete from delivery_zones where name like 'TEST zone %' and id not in (select zone_id from addresses)");
  const p = (await pool.query("select id, price from products where in_stock is not false order by id limit 1")).rows[0];
  productId = p.id;
  price = Number(p.price);
  tinySlotId = (await pool.query(
    "insert into delivery_slots (label, start_time, end_time, capacity, cutoff_minutes, active) values ('TEST tiny', '18:00', '19:00', 1, 60, false) returning id",
  )).rows[0].id;
  closedSlotId = (await pool.query(
    "insert into delivery_slots (label, start_time, end_time, capacity, cutoff_minutes, active) values ('TEST closed', '00:00', '01:00', 50, 60, false) returning id",
  )).rows[0].id;
  pricyZoneId = (await pool.query(
    "insert into delivery_zones (name, fee, min_order, active, sort_order) values ($1, 7000, 99000000, false, 99) returning id",
    [`TEST zone ${randomUUID().slice(0, 8)}`],
  )).rows[0].id;
});

afterAll(async () => {
  restore();
  await cleanupUsers(PREFIX);
  await pool.query("delete from delivery_slots where id = any($1)", [[tinySlotId, closedSlotId]]);
  await pool.query("delete from delivery_zones where id = $1", [pricyZoneId]);
  await pool.end();
});

// Test-only rows are created inactive so they never show to real customers; activate per test.
async function withActive<T>(table: "delivery_slots" | "delivery_zones", id: number, fn: () => Promise<T>) {
  await pool.query(`update ${table} set active = true where id = $1`, [id]);
  try {
    return await fn();
  } finally {
    await pool.query(`update ${table} set active = false where id = $1`, [id]);
  }
}

describe("Delivery options", () => {
  it("lists zones and three days of slots in Kampala time", async () => {
    const zones = (await request(app).get(`${V1}/delivery/zones`).expect(200)).body;
    expect(zones.map((z: { name: string }) => z.name)).toEqual(expect.arrayContaining(["Kololo", "Nakasero", "Ntinda"]));

    const slots = (await request(app).get(`${V1}/delivery/slots`).expect(200)).body;
    const dates = [...new Set(slots.map((s: { date: string }) => s.date))];
    expect(dates).toEqual([kampalaDate(0), kampalaDate(1), kampalaDate(2)]);
    expect(slots.filter((s: { date: string; available: boolean }) => s.date === kampalaDate(1)).every((s: { available: boolean }) => s.available)).toBe(true);
  });
});

describe("Addresses", () => {
  it("are private to their owner", async () => {
    const a = await signIn();
    const b = await signIn();
    const id = await addAddress(a.h);
    expect((await request(app).get(`${V1}/addresses`).set(b.h)).body).toHaveLength(0);
    expect((await request(app).delete(`${V1}/addresses/${id}`).set(b.h)).status).toBe(404);
    await fillCart(b.h);
    expect((await placeOrder(b.h, { addressId: id, ...(await openSlot()) })).status).toBe(404);
  });

  it("rejects inactive zones", async () => {
    const a = await signIn();
    const res = await request(app).post(`${V1}/addresses`).set(a.h).send({ zoneId: pricyZoneId, line: "Somewhere far" });
    expect(res.status).toBe(400);
  });
});

describe("Checkout", () => {
  it("quotes the items from the database; transport is agreed later", async () => {
    const a = await signIn();
    await fillCart(a.h, 3);
    const addressId = await addAddress(a.h);
    const q = (await request(app).post(`${V1}/checkout/quote`).set(a.h).send({ addressId }).expect(200)).body;
    expect(Number(q.subtotal)).toBe(price * 3);
    expect(q.deliveryFee).toBeNull();
    expect(q.transport).toBe("to_agree");
    expect(Number(q.total)).toBe(price * 3);
    expect(q.issues).toEqual([]);
  });

  it("places an order with snapshots, clears the cart and records an event", async () => {
    const a = await signIn();
    await fillCart(a.h, 2);
    const addressId = await addAddress(a.h);
    const slot = await openSlot();
    const res = await placeOrder(a.h, { addressId, ...slot, extra: { notes: "Ring twice" } });
    expect(res.status).toBe(201);
    const o = res.body;
    expect(o).toMatchObject({
      status: "pending",
      paymentMethod: "cod",
      paymentStatus: "unpaid",
      deliveryZoneName: "Kololo",
      deliveryAddress: "Home - Plot 1, Test Road",
      deliveryInstructions: "Gate 2",
      slotDate: slot.slotDate,
      notes: "Ring twice",
    });
    expect(Number(o.total)).toBe(price * 2);
    expect(o).toMatchObject({ deliveryFee: null, transportStatus: "to_agree" });
    expect((await request(app).get(`${V1}/cart`).set(a.h)).body).toHaveLength(0);

    const detail = (await request(app).get(`${V1}/orders/${o.id}`).set(a.h).expect(200)).body;
    expect(detail.orderItems).toHaveLength(1);
    // Status changes only (notes like "Transport agreed" keep the same status).
    const changes = detail.events.filter((e: { fromStatus: string | null; toStatus: string }) => e.fromStatus !== e.toStatus);
    expect(changes.map((e: { toStatus: string }) => e.toStatus)).toEqual(["pending"]);
    const { rows } = await pool.query("select product_name from order_items where order_id = $1", [o.id]);
    expect(rows[0].product_name).toBeTruthy();
  });

  it("requires an Idempotency-Key", async () => {
    const a = await signIn();
    await fillCart(a.h);
    const res = await request(app)
      .post(`${V1}/orders`)
      .set(a.h)
      .send({ addressId: await addAddress(a.h), ...(await openSlot()), paymentMethod: "cod" });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/Idempotency-Key/);
  });

  it("replaying the same key returns the same order (sequential and concurrent)", async () => {
    const a = await signIn();
    await fillCart(a.h);
    const addressId = await addAddress(a.h);
    const slot = await openSlot();
    const key = randomUUID();
    const results = await Promise.all(Array.from({ length: 5 }, () => placeOrder(a.h, { addressId, ...slot, key })));
    const ids = new Set(results.map((r) => r.body.id));
    expect(ids.size).toBe(1);
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    const again = await placeOrder(a.h, { addressId, ...slot, key });
    expect(again.status).toBe(200);
    expect(again.body.id).toBe([...ids][0]);
    const { rows } = await pool.query("select count(*) from orders where user_id = $1", [a.userId]);
    expect(Number(rows[0].count)).toBe(1);
  });

  it("never oversells a slot under concurrent orders", async () => {
    await withActive("delivery_slots", tinySlotId, async () => {
      const users = await Promise.all([signIn(), signIn(), signIn()]);
      const addrs = await Promise.all(users.map(async (u) => (await fillCart(u.h), addAddress(u.h))));
      const results = await Promise.all(
        users.map((u, i) => placeOrder(u.h, { addressId: addrs[i], slotId: tinySlotId, slotDate: kampalaDate(1) })),
      );
      expect(results.filter((r) => r.status === 201)).toHaveLength(1);
      expect(results.filter((r) => r.status === 409)).toHaveLength(2);
      // Losers keep their carts.
      const loser = users[results.findIndex((r) => r.status === 409)];
      expect((await request(app).get(`${V1}/cart`).set(loser.h)).body).toHaveLength(1);
    });
  });

  it("rejects slots past their cutoff and dates outside the booking window", async () => {
    const a = await signIn();
    await fillCart(a.h);
    const addressId = await addAddress(a.h);
    await withActive("delivery_slots", closedSlotId, async () => {
      expect((await placeOrder(a.h, { addressId, slotId: closedSlotId, slotDate: kampalaDate(0) })).status).toBe(409);
    });
    const { slotId } = await openSlot();
    expect((await placeOrder(a.h, { addressId, slotId, slotDate: kampalaDate(5) })).status).toBe(400);
    expect((await placeOrder(a.h, { addressId, slotId, slotDate: kampalaDate(-1) })).status).toBe(400);
  });

  it("enforces the zone minimum order", async () => {
    await withActive("delivery_zones", pricyZoneId, async () => {
      const a = await signIn();
      await fillCart(a.h, 1);
      const addressId = await addAddress(a.h, pricyZoneId);
      const q = (await request(app).post(`${V1}/checkout/quote`).set(a.h).send({ addressId })).body;
      expect(q.issues.map((i: { code: string }) => i.code)).toContain("BELOW_MINIMUM");
      expect((await placeOrder(a.h, { addressId, ...(await openSlot()) })).status).toBe(400);
    });
  });

  it("refuses an empty cart", async () => {
    const a = await signIn();
    const res = await placeOrder(a.h, { addressId: await addAddress(a.h), ...(await openSlot()) });
    expect(res.status).toBe(400);
  });
});

describe("Order lifecycle", () => {
  async function newOrder() {
    const u = await signIn();
    await fillCart(u.h);
    const res = await placeOrder(u.h, { addressId: await addAddress(u.h), ...(await openSlot()) });
    expect(res.status).toBe(201);
    return { u, orderId: res.body.id as number };
  }

  it("customers can cancel only their own pending orders", async () => {
    const { u, orderId } = await newOrder();
    const other = await signIn();
    expect((await request(app).post(`${V1}/orders/${orderId}/cancel`).set(other.h)).status).toBe(404);

    const res = await request(app).post(`${V1}/orders/${orderId}/cancel`).set(u.h).send({ reason: "Changed my mind" });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: "cancelled", paymentStatus: "void" });
    expect(res.body.cancelledAt).toBeTruthy();
    expect((await request(app).post(`${V1}/orders/${orderId}/cancel`).set(u.h)).status).toBe(409);
  });

  it("cancelled orders free their slot capacity", async () => {
    await withActive("delivery_slots", tinySlotId, async () => {
      const a = await signIn();
      await fillCart(a.h);
      const first = await placeOrder(a.h, { addressId: await addAddress(a.h), slotId: tinySlotId, slotDate: kampalaDate(2) });
      expect(first.status).toBe(201);
      await request(app).post(`${V1}/orders/${first.body.id}/cancel`).set(a.h).expect(200);
      const b = await signIn();
      await fillCart(b.h);
      expect((await placeOrder(b.h, { addressId: await addAddress(b.h), slotId: tinySlotId, slotDate: kampalaDate(2) })).status).toBe(201);
    });
  });

  it("admins move orders only along allowed transitions, with an audit trail", async () => {
    const { u, orderId } = await newOrder();
    const admin = await staffSession(PREFIX, "staff");
    const set = (status: string) => request(app).put(`${V1}/orders/${orderId}/status`).set(admin.h).send({ status });

    expect((await set("delivered")).status).toBe(409); // can't skip steps
    for (const s of ["confirmed", "preparing"]) expect((await set(s)).status).toBe(200);
    await request(app).post(`${V1}/admin/orders/${orderId}/transport`).set(admin.h).send({ fee: 5000 }).expect(200);
    expect((await set("out_for_delivery")).status).toBe(200);
    // Once confirmed, the customer can no longer cancel in-app.
    expect((await request(app).post(`${V1}/orders/${orderId}/cancel`).set(u.h)).status).toBe(409);
    const delivered = await set("delivered");
    expect(delivered.status).toBe(200);
    expect(delivered.body.paymentStatus).toBe("paid"); // cash collected on delivery
    expect((await set("cancelled")).status).toBe(409); // terminal

    const detail = (await request(app).get(`${V1}/orders/${orderId}`).set(u.h)).body;
    // Status changes only (notes like "Transport agreed" keep the same status).
    const changes = detail.events.filter((e: { fromStatus: string | null; toStatus: string }) => e.fromStatus !== e.toStatus);
    expect(changes.map((e: { toStatus: string }) => e.toStatus)).toEqual([
      "pending", "confirmed", "preparing", "out_for_delivery", "delivered",
    ]);
    const { rows } = await pool.query("select count(*) from order_events where order_id = $1 and actor_admin_id = $2", [orderId, admin.adminId]);
    expect(Number(rows[0].count)).toBe(5); // 4 status changes + transport agreed
  });
});
