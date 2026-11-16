/** Customer accounts created and used with an email code (EMAIL_OTP_ENABLED), plus linking phone and email. */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  V1, addAddress, app, captureCodes, cleanupUsers, firstZoneId, openSlot, phones, placeOrder, pool, request,
  signIn as signInPhone,
} from "./helpers.js";

const PREFIX = "+2567994";
const RUN = `emailtest${Date.now()}`;
const EMAIL_LIKE = `${RUN}-%@example.test`;
const nextPhone = phones(PREFIX);
let seq = 0;
const nextEmail = () => `${RUN}-${seq++}@example.test`;
const { codes, restore } = captureCodes();
let productId: number;

/** Backdate codes so the resend throttle doesn't block the next request in the same test. */
const ageCodes = (id: string) =>
  pool.query("update otp_verifications set created_at = created_at - interval '5 minutes' where phone_number = $1", [id]);

async function signInEmail(email: string) {
  await request(app).post(`${V1}/auth/otp`).send({ email }).expect(200);
  const res = await request(app).post(`${V1}/auth/token`).send({ email, otp: codes.get(email.toLowerCase()) });
  expect(res.status).toBe(200);
  return { user: res.body.user, h: { Authorization: `Bearer ${res.body.accessToken}` } };
}

beforeAll(async () => {
  productId = (await pool.query("insert into products (name, price, in_stock) values ('TEST email item', 1000, true) returning id")).rows[0].id;
});
beforeEach(() => {
  process.env.EMAIL_OTP_ENABLED = "true";
});
afterAll(async () => {
  restore();
  delete process.env.EMAIL_OTP_ENABLED;
  await pool.query("delete from cart_items where product_id = $1", [productId]);
  await cleanupUsers(PREFIX, EMAIL_LIKE);
  await pool.query("delete from inventory_movements where product_id = $1", [productId]);
  await pool.query("delete from products where id = $1", [productId]);
  await pool.end();
});

describe("email accounts", () => {
  it("creates an account from an email code, stored as email (lower-case) with no phone", async () => {
    const email = nextEmail();
    const { user } = await signInEmail(email.toUpperCase());
    expect(user).toMatchObject({ email, phoneNumber: null });
    // Signing in again finds the same account.
    await ageCodes(email);
    expect((await signInEmail(email)).user.id).toBe(user.id);
  });

  it("is switched off by EMAIL_OTP_ENABLED, and the app can ask", async () => {
    expect((await request(app).get(`${V1}/auth/methods`)).body).toEqual({ email: true });
    process.env.EMAIL_OTP_ENABLED = "false";
    expect((await request(app).get(`${V1}/auth/methods`)).body).toEqual({ email: false });
    const res = await request(app).post(`${V1}/auth/otp`).send({ email: nextEmail() });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/Email sign-in isn't available/);
    // Phone sign-in is unaffected.
    await signInPhone(codes, nextPhone());
  });

  it("email accounts can set a password, sign in with it, and reset it with an email code", async () => {
    const email = nextEmail();
    const { h } = await signInEmail(email);
    await request(app).put(`${V1}/auth/password`).set(h).send({ password: "email-pass-123" }).expect(200);

    const ok = await request(app).post(`${V1}/auth/password/login`).send({ email, password: "email-pass-123" });
    expect(ok.status).toBe(200);
    expect(ok.body.user.email).toBe(email);
    const bad = await request(app).post(`${V1}/auth/password/login`).send({ email, password: "wrong-pass-123" });
    expect(bad.status).toBe(401);
    expect(bad.body.message).toBe("Wrong email or password");

    await ageCodes(email);
    await request(app).post(`${V1}/auth/otp`).send({ email }).expect(200);
    await request(app).post(`${V1}/auth/password/reset`).send({ email, otp: codes.get(email), password: "new-email-pass-9" }).expect(200);
    await request(app).post(`${V1}/auth/password/login`).send({ email, password: "new-email-pass-9" }).expect(200);
  });

  it("needs a contact phone on the address to order, then records it with the email", async () => {
    const { h } = await signInEmail(nextEmail());
    await request(app).post(`${V1}/cart`).set(h).send({ productId, quantity: 1 }).expect(201);
    const slot = await openSlot();

    const noPhone = await placeOrder(h, { addressId: await addAddress(h), ...slot });
    expect(noPhone.status).toBe(400);
    expect(noPhone.body.message).toMatch(/contact phone/);

    const withPhone = (
      await request(app).post(`${V1}/addresses`).set(h)
        .send({ label: "Work", zoneId: await firstZoneId(), line: "Plot 9, Test Road", contactPhone: "+256700111222" })
    ).body.id;
    const order = await placeOrder(h, { addressId: withPhone, ...slot });
    expect(order.status).toBe(201);
    const row = (await pool.query("select customer_phone, customer_email from orders where id = $1", [order.body.id])).rows[0];
    expect(row.customer_phone).toBe("+256700111222");
    expect(row.customer_email).toMatch(/@example\.test$/);
  });
});

describe("linking phone and email", () => {
  it("a phone account adds an email with a code, then signs in either way", async () => {
    const phoneUser = await signInPhone(codes, nextPhone());
    const email = nextEmail();
    await request(app).post(`${V1}/auth/link`).set(phoneUser.h).send({ email }).expect(200);
    const wrong = await request(app).post(`${V1}/auth/link/verify`).set(phoneUser.h).send({ email, otp: "000000" });
    expect(wrong.status).toBe(401);
    await ageCodes(email);
    await request(app).post(`${V1}/auth/link`).set(phoneUser.h).send({ email }).expect(200);
    const linked = await request(app).post(`${V1}/auth/link/verify`).set(phoneUser.h).send({ email, otp: codes.get(email) });
    expect(linked.status).toBe(200);
    expect(linked.body).toMatchObject({ id: phoneUser.userId, phoneNumber: phoneUser.phone, email });

    await ageCodes(email);
    expect((await signInEmail(email)).user.id).toBe(phoneUser.userId);
  });

  it("an email account adds a phone", async () => {
    const { user, h } = await signInEmail(nextEmail());
    const phone = nextPhone();
    await request(app).post(`${V1}/auth/link`).set(h).send({ phoneNumber: phone }).expect(200);
    const res = await request(app).post(`${V1}/auth/link/verify`).set(h).send({ phoneNumber: phone, otp: codes.get(phone) });
    expect(res.body).toMatchObject({ id: user.id, phoneNumber: phone });
  });

  it("refuses an email or phone that already has its own account, or a second one", async () => {
    const a = await signInEmail(nextEmail());
    const b = await signInPhone(codes, nextPhone());
    const taken = await request(app).post(`${V1}/auth/link`).set(b.h).send({ email: a.user.email });
    expect(taken.status).toBe(409);
    expect(taken.body.message).toMatch(/already has its own FreshMart account/);

    const second = await request(app).post(`${V1}/auth/link`).set(b.h).send({ phoneNumber: nextPhone() });
    expect(second.status).toBe(409);
    expect((await request(app).post(`${V1}/auth/link`).send({ email: nextEmail() })).status).toBe(401);
  });
});
