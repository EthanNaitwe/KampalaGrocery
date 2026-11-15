import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Fake SMS provider: records messages and can be told to fail (simulated outage).
const sms = vi.hoisted(() => ({ sent: [] as Array<{ to: string; body: string }>, fail: false }));
vi.mock("../server/sms.js", () => ({
  smsConfigured: () => true,
  isSmsRecipient: (v: string | null | undefined) => !!v && /^\+\d{8,15}$/.test(v),
  sendSms: async (to: string, body: string) => {
    if (sms.fail) throw new Error("Provider unavailable");
    sms.sent.push({ to, body });
    return `SM${sms.sent.length}`;
  },
}));

import { V1, addAddress, agreeTransport, app, cleanupUsers, staffSession, type StaffSession, openSlot, phones, placeOrder, pool, request } from "./helpers.js";

const PREFIX = "+2567994";
const nextPhone = phones(PREFIX);

/** Signs in using the code delivered through the fake SMS provider. */
async function signIn(phone = nextPhone()) {
  await request(app).post(`${V1}/auth/otp`).send({ phoneNumber: phone }).expect(200);
  const code = [...sms.sent].reverse().find((m) => m.to === phone)!.body.match(/(\d{6})/)![1];
  const res = await request(app).post(`${V1}/auth/token`).send({ phoneNumber: phone, otp: code }).expect(200);
  return { phone, userId: res.body.user.id as string, h: { Authorization: `Bearer ${res.body.accessToken}` } };
}

let productId: number;
let staff: StaffSession;
const createdZones: number[] = [];
const createdSlots: number[] = [];

async function newOrder() {
  const u = await signIn();
  await request(app).post(`${V1}/cart`).set(u.h).send({ productId, quantity: 1 }).expect(201);
  const res = await placeOrder(u.h, { addressId: await addAddress(u.h), ...(await openSlot()) });
  expect(res.status).toBe(201);
  return { u, order: res.body as { id: number; customerPhone: string } };
}
const templatesFor = async (orderId: number) =>
  (await pool.query("select template, status from notifications where order_id = $1 order by id", [orderId])).rows;
const setStatus = (id: number, status: string) =>
  request(app).put(`${V1}/orders/${id}/status`).set(staff.h).send({ status });

beforeAll(async () => {
  // Untracked stock so many test orders can be placed.
  productId = (await pool.query("insert into products (name, price, in_stock) values ('TEST staff item', 3000, true) returning id")).rows[0].id;
  staff = await staffSession(PREFIX);
});

afterAll(async () => {
  await pool.query("delete from cart_items where product_id = $1", [productId]);
  await cleanupUsers(PREFIX);
  await pool.query("delete from inventory_movements where product_id = $1", [productId]);
  await pool.query("delete from products where id = $1", [productId]);
  if (createdSlots.length) await pool.query("delete from delivery_slots where id = any($1)", [createdSlots]);
  if (createdZones.length) await pool.query("delete from delivery_zones where id = any($1)", [createdZones]);
  await pool.end();
});

describe("Access", () => {
  it("staff endpoints require an admin", async () => {
    const customer = await signIn();
    for (const path of ["/admin/summary", "/admin/orders", "/admin/issues", "/admin/delivery/zones"]) {
      expect((await request(app).get(`${V1}${path}`)).status).toBe(401);
      expect((await request(app).get(`${V1}${path}`).set(customer.h)).status).toBe(401);
      expect((await request(app).get(`${V1}${path}`).set(staff.h)).status).toBe(200);
    }
  });
});

describe("Notifications", () => {
  it("texts the customer at key steps, but not for internal ones", async () => {
    const { order } = await newOrder();
    await setStatus(order.id, "confirmed").expect(200);
    await setStatus(order.id, "preparing").expect(200);
    await request(app).patch(`${V1}/admin/orders/${order.id}`).set(staff.h).send({ assignedRider: "Musa 0772000000" }).expect(200);
    await agreeTransport(staff.h, order.id, 5000).expect(200);
    await setStatus(order.id, "out_for_delivery").expect(200);
    await setStatus(order.id, "delivered").expect(200);

    expect((await templatesFor(order.id)).map((r) => r.template)).toEqual([
      "order_placed", "order_confirmed", "order_transport_agreed", "order_out_for_delivery", "order_delivered",
    ]);
    const onTheWay = sms.sent.find((m) => m.body.includes(`order #${order.id} is on the way`))!;
    expect(onTheWay.to).toBe(order.customerPhone);
    expect(onTheWay.body).toContain("Musa 0772000000");
    expect(onTheWay.body).toMatch(/UGX 8,000/); // 3,000 + 5,000 delivery
  });

  it("an SMS outage never blocks the order update, and staff can resend", async () => {
    const { order } = await newOrder();
    sms.fail = true;
    const res = await setStatus(order.id, "confirmed");
    sms.fail = false;
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("confirmed");

    const failed = (await pool.query(
      "select id, status, error from notifications where order_id = $1 and template = 'order_confirmed'", [order.id],
    )).rows[0];
    expect(failed).toMatchObject({ status: "failed", error: "Provider unavailable" });
    expect((await request(app).get(`${V1}/admin/summary`).set(staff.h)).body.failedNotifications).toBeGreaterThanOrEqual(1);

    const resent = await request(app).post(`${V1}/admin/notifications/${failed.id}/resend`).set(staff.h).expect(200);
    expect(resent.body).toMatchObject({ status: "sent", attempts: 2 });
    expect((await request(app).post(`${V1}/admin/notifications/${failed.id}/resend`).set(staff.h)).status).toBe(409);
  });

  it("customer cancellations are confirmed by text", async () => {
    const { u, order } = await newOrder();
    await request(app).post(`${V1}/orders/${order.id}/cancel`).set(u.h).expect(200);
    expect((await templatesFor(order.id)).map((r) => r.template)).toEqual(["order_placed", "order_cancelled"]);
  });
});

describe("Order queue", () => {
  it("lists active orders with counts, and finds orders by number or phone", async () => {
    const { order } = await newOrder();
    const list = (await request(app).get(`${V1}/admin/orders`).set(staff.h).expect(200)).body;
    expect(list.items.some((o: { id: number }) => o.id === order.id)).toBe(true);
    expect(list.counts.pending).toBeGreaterThanOrEqual(1);
    expect(list.items.every((o: { status: string }) => !["delivered", "cancelled"].includes(o.status))).toBe(true);

    const byId = (await request(app).get(`${V1}/admin/orders?status=all&q=${order.id}`).set(staff.h)).body;
    expect(byId.items.map((o: { id: number }) => o.id)).toContain(order.id);
    const digits = order.customerPhone.slice(-7);
    const byPhone = (await request(app).get(`${V1}/admin/orders?status=all&q=${digits}`).set(staff.h)).body;
    expect(byPhone.items.map((o: { id: number }) => o.id)).toContain(order.id);
  });

  it("order detail shows items, timeline, messages and issues; rider assignment is audited", async () => {
    const { order } = await newOrder();
    await request(app).patch(`${V1}/admin/orders/${order.id}`).set(staff.h).send({ assignedRider: "Sarah" }).expect(200);
    const d = (await request(app).get(`${V1}/admin/orders/${order.id}`).set(staff.h).expect(200)).body;
    expect(d.orderItems).toHaveLength(1);
    expect(d.notifications[0].template).toBe("order_placed");
    expect(d.events.map((e: { note: string | null }) => e.note)).toContain("Rider assigned: Sarah");
    expect(d.issues).toEqual([]);
  });
});

describe("Dashboard", () => {
  it("summarises the queue, today's slots and low stock", async () => {
    await pool.query("update products set stock_quantity = 2 where id = $1", [productId]);
    try {
      const s = (await request(app).get(`${V1}/admin/summary`).set(staff.h).expect(200)).body;
      expect(s.awaiting).toEqual(expect.objectContaining({ pending: expect.any(Number), out_for_delivery: expect.any(Number) }));
      expect(s.lowStock.map((p: { id: number }) => p.id)).toContain(productId);
      expect(Array.isArray(s.todaySlots)).toBe(true);
    } finally {
      await pool.query("update products set stock_quantity = null where id = $1", [productId]);
    }
  });
});

describe("Delivery settings", () => {
  it("staff add and edit areas; names are unique; inactive areas are hidden from customers", async () => {
    const name = `TEST area ${Date.now()}`;
    const z = (await request(app).post(`${V1}/admin/delivery/zones`).set(staff.h).send({ name, fee: 7000, minOrder: "20000" }).expect(201)).body;
    createdZones.push(z.id);
    expect(z).toMatchObject({ fee: "7000.00", minOrder: "20000.00", active: true });
    expect((await request(app).post(`${V1}/admin/delivery/zones`).set(staff.h).send({ name, fee: 1 })).status).toBe(409);
    expect((await request(app).get(`${V1}/delivery/zones`)).body.map((x: { id: number }) => x.id)).toContain(z.id);
    await request(app).patch(`${V1}/admin/delivery/zones/${z.id}`).set(staff.h).send({ active: false }).expect(200);
    expect((await request(app).get(`${V1}/delivery/zones`)).body.map((x: { id: number }) => x.id)).not.toContain(z.id);
  });

  it("staff add and edit slots with validation", async () => {
    const bad = await request(app).post(`${V1}/admin/delivery/slots`).set(staff.h)
      .send({ label: "Bad", startTime: "18:00", endTime: "09:00", capacity: 5 });
    expect(bad.status).toBe(400);
    const s = (await request(app).post(`${V1}/admin/delivery/slots`).set(staff.h)
      .send({ label: "TEST late", startTime: "18:00", endTime: "20:00", capacity: 5, active: false }).expect(201)).body;
    createdSlots.push(s.id);
    expect((await request(app).patch(`${V1}/admin/delivery/slots/${s.id}`).set(staff.h).send({ endTime: "17:00" })).status).toBe(400);
    const p = (await request(app).patch(`${V1}/admin/delivery/slots/${s.id}`).set(staff.h).send({ capacity: 12, cutoffMinutes: 90 }).expect(200)).body;
    expect(p).toMatchObject({ capacity: 12, cutoffMinutes: 90 });
  });
});

describe("Support", () => {
  it("customers report problems on their own orders; staff resolve them", async () => {
    const { u, order } = await newOrder();
    const other = await signIn();
    expect((await request(app).post(`${V1}/orders/${order.id}/issues`).set(other.h).send({ category: "late", message: "Where is it?" })).status).toBe(404);
    expect((await request(app).post(`${V1}/orders/${order.id}/issues`).set(u.h).send({ category: "nope", message: "x" })).status).toBe(400);
    const issue = (await request(app).post(`${V1}/orders/${order.id}/issues`).set(u.h)
      .send({ category: "missing_item", message: "The tomatoes were missing" }).expect(201)).body;

    const open = (await request(app).get(`${V1}/admin/issues`).set(staff.h)).body;
    expect(open.find((i: { id: number }) => i.id === issue.id)).toMatchObject({ category: "missing_item", customerPhone: order.customerPhone });

    const resolved = (await request(app).patch(`${V1}/admin/issues/${issue.id}`).set(staff.h)
      .send({ status: "resolved", resolution: "Refunded UGX 2,500 in cash" }).expect(200)).body;
    expect(resolved).toMatchObject({ status: "resolved", resolvedByAdminId: staff.adminId });
    expect((await request(app).get(`${V1}/orders/${order.id}/issues`).set(u.h)).body[0].status).toBe("resolved");
  });

  it("exposes configured support contacts", async () => {
    const res = (await request(app).get(`${V1}/support`).expect(200)).body;
    expect(Object.keys(res).sort()).toEqual(["email", "hours", "phone", "whatsapp"]);
  });
});
