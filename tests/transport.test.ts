/** Delivery location pins and per-order transport agreement. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  V1, agreeTransport, app, captureCodes, cleanupUsers, firstZoneId, makeAdmin, openSlot, phones, placeOrder, pool, request,
  signIn as signInWith,
} from "./helpers.js";

const PREFIX = "+2567996";
const nextPhone = phones(PREFIX);
const { codes, restore } = captureCodes();
const signIn = () => signInWith(codes, nextPhone());

// Kololo, roughly.
const PIN = { latitude: 0.3333, longitude: 32.5951 };

let productId: number;
let staff: Awaited<ReturnType<typeof signIn>>;

async function pinnedAddress(h: Record<string, string>) {
  const res = await request(app).post(`${V1}/addresses`).set(h)
    .send({ zoneId: await firstZoneId(), line: "Near Kololo Airstrip", ...PIN });
  expect(res.status).toBe(201);
  return res.body as { id: number; latitude: number; longitude: number };
}

async function newOrder(u: Awaited<ReturnType<typeof signIn>>) {
  await request(app).post(`${V1}/cart`).set(u.h).send({ productId, quantity: 2 }).expect(201);
  const a = await pinnedAddress(u.h);
  const res = await placeOrder(u.h, { addressId: a.id, ...(await openSlot()) });
  expect(res.status).toBe(201);
  return res.body as { id: number; total: string; subtotal: string };
}

const move = (id: number, status: string) => request(app).put(`${V1}/orders/${id}/status`).set(staff.h).send({ status });

beforeAll(async () => {
  productId = (await pool.query("insert into products (name, price, in_stock) values ('TEST transport item', 4000, true) returning id")).rows[0].id;
  staff = await signIn();
  await makeAdmin(staff.userId);
});

afterAll(async () => {
  restore();
  await pool.query("delete from cart_items where product_id = $1", [productId]);
  await cleanupUsers(PREFIX);
  await pool.query("delete from products where id = $1", [productId]);
  await pool.end();
});

describe("Current location", () => {
  it("saves the GPS pin with the address and snapshots it onto the order", async () => {
    const u = await signIn();
    const a = await pinnedAddress(u.h);
    expect(a).toMatchObject(PIN);
    await request(app).post(`${V1}/cart`).set(u.h).send({ productId, quantity: 1 }).expect(201);
    const o = (await placeOrder(u.h, { addressId: a.id, ...(await openSlot()) })).body;
    expect(o).toMatchObject({ deliveryLatitude: PIN.latitude, deliveryLongitude: PIN.longitude });
    // Changing the saved address later doesn't move the order's pin.
    await pool.query("update addresses set latitude = 0, longitude = 0 where id = $1", [a.id]);
    const d = (await request(app).get(`${V1}/admin/orders/${o.id}`).set(staff.h)).body;
    expect(d).toMatchObject({ deliveryLatitude: PIN.latitude, deliveryLongitude: PIN.longitude, zoneGuideFee: "5000.00" });
  });

  it("rejects half or out-of-range coordinates", async () => {
    const u = await signIn();
    const zoneId = await firstZoneId();
    expect((await request(app).post(`${V1}/addresses`).set(u.h).send({ zoneId, line: "Somewhere", latitude: 0.3 })).status).toBe(400);
    expect((await request(app).post(`${V1}/addresses`).set(u.h).send({ zoneId, line: "Somewhere", latitude: 95, longitude: 32 })).status).toBe(400);
    // Pin is optional.
    expect((await request(app).post(`${V1}/addresses`).set(u.h).send({ zoneId, line: "Somewhere" })).status).toBe(201);
  });
});

describe("Transport agreed per order", () => {
  it("orders start with transport to agree and can't be dispatched until it is", async () => {
    const u = await signIn();
    const o = await newOrder(u);
    expect(Number(o.total)).toBe(8000);
    await move(o.id, "confirmed").expect(200);
    await move(o.id, "preparing").expect(200);
    const blocked = await move(o.id, "out_for_delivery");
    expect(blocked.status).toBe(409);
    expect(blocked.body.message).toMatch(/transport/i);

    const s = (await request(app).get(`${V1}/admin/summary`).set(staff.h)).body;
    expect(s.transportToAgree).toBeGreaterThanOrEqual(1);
  });

  it("agreeing transport updates the total, tells the customer, and is audited", async () => {
    const u = await signIn();
    const o = await newOrder(u);
    const res = await agreeTransport(staff.h, o.id, 6500).send({ fee: 6500, note: "Boda boda, 4km" });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ deliveryFee: "6500.00", total: "14500.00", transportStatus: "agreed" });

    const seen = (await request(app).get(`${V1}/orders/${o.id}`).set(u.h)).body;
    expect(seen).toMatchObject({ deliveryFee: "6500.00", total: "14500.00", transportStatus: "agreed" });
    expect(seen.events.map((e: { note: string | null }) => e.note)).toContain("Transport agreed: UGX 6,500 (Boda boda, 4km)");

    const sms = (await pool.query("select body from notifications where order_id = $1 and template = 'order_transport_agreed'", [o.id])).rows[0];
    expect(sms.body).toMatch(/UGX 6,500.*UGX 14,500/);
  });

  it("can be corrected before dispatch but not after", async () => {
    const u = await signIn();
    const o = await newOrder(u);
    await agreeTransport(staff.h, o.id, 5000).expect(200);
    const fixed = await agreeTransport(staff.h, o.id, 4000).expect(200);
    expect(fixed.body.total).toBe("12000.00");
    for (const s of ["confirmed", "preparing", "out_for_delivery"]) await move(o.id, s).expect(200);
    expect((await agreeTransport(staff.h, o.id, 3000)).status).toBe(409);
  });

  it("only staff can set it, with a valid amount", async () => {
    const u = await signIn();
    const o = await newOrder(u);
    expect((await agreeTransport(u.h, o.id, 1000)).status).toBe(403);
    expect((await agreeTransport(staff.h, o.id, "-5")).status).toBe(400);
    expect((await agreeTransport(staff.h, o.id, "abc")).status).toBe(400);
  });

  it("account deletion removes the delivery pin from past orders", async () => {
    const u = await signIn();
    const o = await newOrder(u);
    await request(app).post(`${V1}/orders/${o.id}/cancel`).set(u.h).expect(200);
    await request(app).delete(`${V1}/auth/account`).set(u.h).expect(204);
    const { rows: [row] } = await pool.query("select delivery_latitude, delivery_longitude from orders where id = $1", [o.id]);
    expect(row).toEqual({ delivery_latitude: null, delivery_longitude: null });
    await pool.query("update users set phone_number = $1 where id = $2", [`${PREFIX}del${Date.now()}`, u.userId]);
  });
});
