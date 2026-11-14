import request from "supertest";
import { randomUUID } from "crypto";
import { expect, vi } from "vitest";
import { app } from "../server/index.js";
import { pool } from "../server/db.js";
import { kampalaDate } from "../server/checkout.js";

export const V1 = "/api/v1";
export { app, pool, request };

/** Captures codes printed by the dev delivery path (DEV_LOG_OTP). */
export function captureCodes() {
  const codes = new Map<string, string>();
  const spy = vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
    const m = String(args[0]).match(/verification code for (\S+): (\d+)/);
    if (m) codes.set(m[1], m[2]);
  });
  return { codes, restore: () => spy.mockRestore() };
}

/** Each test file uses its own phone prefix so cleanup never touches other data. */
export function phones(prefix: string) {
  let seq = Math.floor(Math.random() * 10000);
  return () => `${prefix}${String(seq++).padStart(5, "0")}`;
}

export async function signIn(codes: Map<string, string>, phone: string) {
  await request(app).post(`${V1}/auth/otp`).send({ phoneNumber: phone }).expect(200);
  const res = await request(app).post(`${V1}/auth/token`).send({ phoneNumber: phone, otp: codes.get(phone) });
  expect(res.status).toBe(200);
  return {
    phone,
    userId: res.body.user.id as string,
    accessToken: res.body.accessToken as string,
    refreshToken: res.body.refreshToken as string,
    h: { Authorization: `Bearer ${res.body.accessToken}` },
  };
}

export async function firstZoneId(): Promise<number> {
  return (await pool.query("select id from delivery_zones where active order by sort_order, id limit 1")).rows[0].id;
}

export async function addAddress(h: Record<string, string>, zoneId?: number) {
  const res = await request(app)
    .post(`${V1}/addresses`)
    .set(h)
    .send({ label: "Home", zoneId: zoneId ?? (await firstZoneId()), line: "Plot 1, Test Road", instructions: "Gate 2" });
  expect(res.status).toBe(201);
  return res.body.id as number;
}

/** A slot that is open tomorrow (never past its cutoff while tests run). */
export async function openSlot(): Promise<{ slotId: number; slotDate: string }> {
  const slotId = (await pool.query("select id from delivery_slots where active order by start_time limit 1")).rows[0].id;
  return { slotId, slotDate: kampalaDate(1) };
}

export async function placeOrder(
  h: Record<string, string>,
  opts: { addressId: number; slotId: number; slotDate: string; key?: string; extra?: object },
) {
  return request(app)
    .post(`${V1}/orders`)
    .set(h)
    .set("Idempotency-Key", opts.key ?? randomUUID())
    .send({ addressId: opts.addressId, slotId: opts.slotId, slotDate: opts.slotDate, paymentMethod: "cod", ...opts.extra });
}

/** Removes everything created by users whose phone starts with `prefix`. */
export async function cleanupUsers(prefix: string) {
  const ids = (await pool.query("select id from users where phone_number like $1", [`${prefix}%`])).rows.map((r) => r.id);
  await pool.query("delete from order_events where order_id in (select id from orders where user_id = any($1))", [ids]);
  await pool.query("delete from order_events where actor_user_id = any($1)", [ids]);
  await pool.query(
    "delete from inventory_movements where actor_user_id = any($1) or order_id in (select id from orders where user_id = any($1))",
    [ids],
  );
  await pool.query("delete from order_items where order_id in (select id from orders where user_id = any($1))", [ids]);
  await pool.query("delete from orders where user_id = any($1)", [ids]);
  await pool.query("delete from cart_items where user_id = any($1)", [ids]);
  await pool.query("delete from users where id = any($1)", [ids]); // addresses + refresh tokens cascade
  await pool.query("delete from otp_verifications where phone_number like $1", [`${prefix}%`]);
}

export async function makeAdmin(userId: string) {
  await pool.query("update users set is_admin = true where id = $1", [userId]);
}
