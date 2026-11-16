import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { createHmac } from "crypto";
import { app } from "../server/index.js";
import { pool } from "../server/db.js";
import { addAddress, cleanupUsers, openSlot, placeOrder } from "./helpers.js";

const V1 = "/api/v1";
const PREFIX = "+2567990";
let seq = Math.floor(Math.random() * 10000);
const newPhone = () => `${PREFIX}${String(seq++).padStart(5, "0")}`;

// Capture codes from the dev delivery path.
const codes = new Map<string, string>();
const logSpy = vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
  const m = String(args[0]).match(/verification code for (\S+): (\d+)/);
  if (m) codes.set(m[1], m[2]);
});

async function requestCode(phone: string) {
  const res = await request(app).post(`${V1}/auth/otp`).send({ phoneNumber: phone });
  expect(res.status).toBe(200);
  return codes.get(phone)!;
}

async function signIn(phone = newPhone()) {
  const code = await requestCode(phone);
  const res = await request(app).post(`${V1}/auth/token`).send({ phoneNumber: phone, otp: code, deviceName: "test" });
  expect(res.status).toBe(200);
  return { phone, ...(res.body as { accessToken: string; refreshToken: string; user: { id: string } }) };
}

const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });

let productId: number;
beforeAll(async () => {
  const { rows } = await pool.query("select id from products where in_stock is not false order by id limit 1");
  if (!rows[0]) throw new Error("Test database needs at least one in-stock product");
  productId = rows[0].id;
});

afterAll(async () => {
  logSpy.mockRestore();
  await cleanupUsers(PREFIX);
  await pool.end();
});

describe("OTP", () => {
  it("issues 6-digit codes and never returns them in the response", async () => {
    const phone = newPhone();
    const res = await request(app).post(`${V1}/auth/otp`).send({ phoneNumber: phone });
    expect(res.status).toBe(200);
    expect(codes.get(phone)).toMatch(/^\d{6}$/);
    expect(JSON.stringify(res.body)).not.toContain(codes.get(phone));
  });

  it("stores only a hash of the code", async () => {
    const phone = newPhone();
    const code = await requestCode(phone);
    const { rows } = await pool.query("select otp from otp_verifications where phone_number = $1", [phone]);
    expect(rows[0].otp).toHaveLength(64);
    expect(rows[0].otp).not.toContain(code);
  });

  it("throttles resends for the same identifier", async () => {
    const phone = newPhone();
    await requestCode(phone);
    const res = await request(app).post(`${V1}/auth/otp`).send({ phoneNumber: phone });
    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe("RATE_LIMITED");
    expect(res.body.error.details.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("locks the code after 5 wrong attempts, even if the right code is then sent", async () => {
    const phone = newPhone();
    const code = await requestCode(phone);
    const wrong = code === "000000" ? "111111" : "000000";
    for (let i = 0; i < 5; i++) {
      const r = await request(app).post(`${V1}/auth/token`).send({ phoneNumber: phone, otp: wrong });
      expect(r.status).toBe(401);
    }
    const res = await request(app).post(`${V1}/auth/token`).send({ phoneNumber: phone, otp: code });
    expect(res.status).toBe(401);
  });

  it("caps concurrent guesses at the attempt limit", async () => {
    const phone = newPhone();
    await requestCode(phone);
    await Promise.all(
      Array.from({ length: 12 }, (_, i) =>
        request(app).post(`${V1}/auth/token`).send({ phoneNumber: phone, otp: String(100000 + i) }),
      ),
    );
    const { rows } = await pool.query("select attempts from otp_verifications where phone_number = $1", [phone]);
    expect(rows[0].attempts).toBeLessThanOrEqual(5);
  });

  it("codes are single-use", async () => {
    const phone = newPhone();
    const code = await requestCode(phone);
    expect((await request(app).post(`${V1}/auth/token`).send({ phoneNumber: phone, otp: code })).status).toBe(200);
    expect((await request(app).post(`${V1}/auth/token`).send({ phoneNumber: phone, otp: code })).status).toBe(401);
  });

  it("codes expire 10 minutes after issue (timezone-independent)", async () => {
    const phone = newPhone();
    await requestCode(phone);
    const { rows } = await pool.query(
      "select extract(epoch from expires_at - now()) as s from otp_verifications where phone_number = $1",
      [phone],
    );
    expect(Number(rows[0].s)).toBeGreaterThan(9 * 60);
    expect(Number(rows[0].s)).toBeLessThanOrEqual(10 * 60);
  });

  it("rejects expired codes", async () => {
    const phone = newPhone();
    const code = await requestCode(phone);
    await pool.query("update otp_verifications set expires_at = now() - interval '1 second' where phone_number = $1", [phone]);
    expect((await request(app).post(`${V1}/auth/token`).send({ phoneNumber: phone, otp: code })).status).toBe(401);
  });

  it("gives the same response for new and existing accounts", async () => {
    const existing = await signIn();
    await pool.query("update otp_verifications set created_at = now() - interval '2 minutes' where phone_number = $1", [existing.phone]);
    const a = await request(app).post(`${V1}/auth/otp`).send({ phoneNumber: existing.phone });
    const b = await request(app).post(`${V1}/auth/otp`).send({ phoneNumber: newPhone() });
    expect(a.status).toBe(b.status);
    expect(a.body).toEqual(b.body);
  });
});

describe("Tokens", () => {
  it("access token authenticates; forged and expired tokens do not", async () => {
    const s = await signIn();
    expect((await request(app).get(`${V1}/auth/me`).set(bearer(s.accessToken))).body.id).toBe(s.user.id);

    const [h, p] = s.accessToken.split(".");
    const forged = `${h}.${p}.${"A".repeat(43)}`;
    expect((await request(app).get(`${V1}/auth/me`).set(bearer(forged))).status).toBe(401);

    const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
    const eh = b64({ alg: "HS256", typ: "JWT" });
    const ep = b64({ sub: s.user.id, typ: "access", iat: 1, exp: 2 });
    const sig = createHmac("sha256", process.env.JWT_SECRET!).update(`${eh}.${ep}`).digest("base64url");
    expect((await request(app).get(`${V1}/auth/me`).set(bearer(`${eh}.${ep}.${sig}`))).status).toBe(401);
  });

  it("refresh rotates the token; reusing an old one revokes the whole sign-in", async () => {
    const s = await signIn();
    const r1 = await request(app).post(`${V1}/auth/refresh`).send({ refreshToken: s.refreshToken });
    expect(r1.status).toBe(200);
    expect(r1.body.refreshToken).not.toBe(s.refreshToken);

    // Replay of the original token = theft signal.
    expect((await request(app).post(`${V1}/auth/refresh`).send({ refreshToken: s.refreshToken })).status).toBe(401);
    // The legitimately rotated token is now revoked too.
    expect((await request(app).post(`${V1}/auth/refresh`).send({ refreshToken: r1.body.refreshToken })).status).toBe(401);
  });

  it("logout revokes the refresh token", async () => {
    const s = await signIn();
    expect((await request(app).post(`${V1}/auth/logout`).send({ refreshToken: s.refreshToken })).status).toBe(200);
    expect((await request(app).post(`${V1}/auth/refresh`).send({ refreshToken: s.refreshToken })).status).toBe(401);
  });

  it("rejects expired refresh tokens", async () => {
    const s = await signIn();
    await pool.query("update refresh_tokens set expires_at = now() - interval '1 second' where user_id = $1", [s.user.id]);
    expect((await request(app).post(`${V1}/auth/refresh`).send({ refreshToken: s.refreshToken })).status).toBe(401);
  });
});

describe("Authorization", () => {
  it("requires authentication for customer endpoints", async () => {
    for (const [method, path] of [["get", "/cart"], ["get", "/orders"], ["post", "/orders"], ["get", "/auth/me"]] as const) {
      expect((await request(app)[method](`${V1}${path}`)).status).toBe(401);
    }
  });

  it("customers cannot use admin endpoints", async () => {
    const s = await signIn();
    const h = bearer(s.accessToken);
    expect((await request(app).post(`${V1}/products`).set(h).send({ name: "x", price: "1" })).status).toBe(401);
    expect((await request(app).put(`${V1}/products/${productId}`).set(h).send({ price: "1" })).status).toBe(401);
    expect((await request(app).delete(`${V1}/products/${productId}`).set(h)).status).toBe(401);
    expect((await request(app).post(`${V1}/admin/categories`).set(h).send({ name: "x" })).status).toBe(401);
    expect((await request(app).put(`${V1}/orders/1/status`).set(h).send({ status: "delivered" })).status).toBe(401);
  });

  it("customers can only see their own orders", async () => {
    const a = await signIn();
    const b = await signIn();
    await request(app).post(`${V1}/cart`).set(bearer(a.accessToken)).send({ productId, quantity: 1 }).expect(201);
    const order = await placeOrder(bearer(a.accessToken), { addressId: await addAddress(bearer(a.accessToken)), ...(await openSlot()) });
    expect(order.status).toBe(201);

    expect((await request(app).get(`${V1}/orders/${order.body.id}`).set(bearer(a.accessToken))).status).toBe(200);
    expect((await request(app).get(`${V1}/orders/${order.body.id}`).set(bearer(b.accessToken))).status).toBe(404);
    const list = await request(app).get(`${V1}/orders`).set(bearer(b.accessToken));
    expect(list.body.find((o: { id: number }) => o.id === order.body.id)).toBeUndefined();
  });

  it("the server computes order totals; client-supplied totals are ignored", async () => {
    const s = await signIn();
    await request(app).post(`${V1}/cart`).set(bearer(s.accessToken)).send({ productId, quantity: 2 }).expect(201);
    const { rows } = await pool.query("select price from products where id = $1", [productId]);
    const addressId = await addAddress(bearer(s.accessToken));
    const order = await placeOrder(bearer(s.accessToken), {
      addressId,
      ...(await openSlot()),
      extra: { total: "1.00", subtotal: "1.00", deliveryFee: "0" },
    });
    expect(order.status).toBe(201);
    expect(Number(order.body.subtotal)).toBe(Number(rows[0].price) * 2);
    // Transport is agreed later, so at checkout the total is the items only.
    expect(Number(order.body.total)).toBe(Number(rows[0].price) * 2);
    expect(order.body.deliveryFee).toBeNull();
  });
});

describe("Account deletion", () => {
  it("erases personal data, revokes tokens, and frees the phone number", async () => {
    const s = await signIn();
    await request(app).delete(`${V1}/auth/account`).set(bearer(s.accessToken)).expect(204);

    expect((await request(app).get(`${V1}/auth/me`).set(bearer(s.accessToken))).status).toBe(401);
    expect((await request(app).post(`${V1}/auth/refresh`).send({ refreshToken: s.refreshToken })).status).toBe(401);

    const { rows } = await pool.query("select phone_number, email, deleted_at from users where id = $1", [s.user.id]);
    expect(rows[0]).toMatchObject({ phone_number: null, email: null });
    expect(rows[0].deleted_at).not.toBeNull();

    await pool.query("update otp_verifications set created_at = now() - interval '2 minutes' where phone_number = $1", [s.phone]);
    const again = await signIn(s.phone);
    expect(again.user.id).not.toBe(s.user.id);
    await pool.query("update users set phone_number = $1 where id = $2", [`${PREFIX}del${seq++}`, s.user.id]);
  });
});
