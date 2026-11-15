/** Staff console accounts: email + password, roles, invites and password resets. */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  STAFF_PASSWORD, V1, app, cleanupUsers, phones, pool, request, signIn, staffSession, type StaffSession,
} from "./helpers.js";

const PREFIX = "+2567998";
const nextPhone = phones(PREFIX);
// Sign-in codes and invite/reset links are printed by the dev delivery path (no SMS/SMTP in tests).
const codes = new Map<string, string>();
const links = new Map<string, string>();
const logSpy = vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
  const line = String(args[0]);
  const code = line.match(/verification code for (\S+): (\d+)/);
  if (code) codes.set(code[1], code[2]);
  const link = line.match(/^\[dev\] .* for (\S+): (\S+token=(\S+))$/);
  if (link) links.set(link[1], link[3]);
});

const login = (email: string, password: string) => request(app).post(`${V1}/admin/auth/login`).send({ email, password });
const me = (h: Record<string, string>) => request(app).get(`${V1}/admin/auth/me`).set(h);

let owner: StaffSession;

beforeAll(async () => {
  owner = await staffSession(PREFIX, "owner");
});

afterAll(async () => {
  logSpy.mockRestore();
  await cleanupUsers(PREFIX); // also removes staff accounts for this prefix
  await pool.end();
});

describe("staff sign-in", () => {
  it("signs in with email + password (any letter case) and never returns the hash", async () => {
    const res = await login(owner.email.toUpperCase(), STAFF_PASSWORD);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: owner.adminId, email: owner.email, name: "Test owner", role: "owner" });
    const who = await me(owner.h);
    expect(who.status).toBe(200);
    expect(JSON.stringify(who.body)).not.toMatch(/scrypt|password/i);
  });

  it("gives the same answer for a wrong password and an unknown email", async () => {
    const a = await login(owner.email, "not-the-password");
    const b = await login(`nobody-${Date.now()}@example.com`, STAFF_PASSWORD);
    expect([a.status, b.status]).toEqual([401, 401]);
    expect(a.body.message).toBe("Wrong email or password");
    expect(b.body.message).toBe(a.body.message);
  });

  it("locks after 5 wrong passwords", async () => {
    const s = await staffSession(PREFIX, "staff");
    for (let i = 0; i < 5; i++) expect((await login(s.email, `wrong-${i}`)).status).toBe(401);
    expect((await login(s.email, STAFF_PASSWORD)).status).toBe(429);
  });

  it("customer accounts can't use the console", async () => {
    const customer = await signIn(codes, nextPhone());
    expect((await request(app).get(`${V1}/admin/summary`).set(customer.h)).status).toBe(401);
    expect((await request(app).put(`${V1}/orders/1/status`).set(customer.h).send({ status: "confirmed" })).status).toBe(401);
    expect((await request(app).post(`${V1}/products`).set(customer.h).send({ name: "x", price: "1" })).status).toBe(401);
  });

  it("signs out", async () => {
    const s = await staffSession(PREFIX, "staff");
    await request(app).post(`${V1}/admin/auth/logout`).set(s.h).expect(200);
    expect((await me(s.h)).status).toBe(401);
  });
});

describe("roles", () => {
  it("staff run daily operations but can't change products, prices, delivery settings or accounts", async () => {
    const s = await staffSession(PREFIX, "staff");
    expect((await request(app).get(`${V1}/admin/summary`).set(s.h)).status).toBe(200);
    expect((await request(app).get(`${V1}/admin/orders`).set(s.h)).status).toBe(200);
    expect((await request(app).post(`${V1}/products`).set(s.h).send({ name: "TEST nope", price: "100" })).status).toBe(403);
    expect((await request(app).put(`${V1}/products/1`).set(s.h).send({ price: "1" })).status).toBe(403);
    expect((await request(app).post(`${V1}/admin/delivery/zones`).set(s.h).send({ name: "TEST nope", fee: "1" })).status).toBe(403);
    expect((await request(app).get(`${V1}/admin/staff`).set(s.h)).status).toBe(403);
  });

  it("the last active owner can't be demoted or switched off, and owners can't demote themselves", async () => {
    const self = await request(app).patch(`${V1}/admin/staff/${owner.adminId}`).set(owner.h).send({ role: "staff" });
    expect(self.status).toBe(409);
    const other = await staffSession(PREFIX, "owner");
    // With two owners, one can switch the other off...
    await request(app).patch(`${V1}/admin/staff/${other.adminId}`).set(owner.h).send({ active: false }).expect(200);
    // ...which signs them out immediately and stops them signing back in.
    expect((await me(other.h)).status).toBe(401);
    expect((await login(other.email, STAFF_PASSWORD)).status).toBe(401);
  });
});

describe("invites and password resets", () => {
  it("an owner invites staff, who set a password from the emailed link", async () => {
    const email = `staff${PREFIX.replace(/\D/g, "")}-inv${Date.now()}@example.com`;
    const res = await request(app).post(`${V1}/admin/staff`).set(owner.h).send({ email, name: "New Helper" });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ inviteSent: true, member: { email, role: "staff", hasPassword: false, active: true } });
    expect((await login(email, STAFF_PASSWORD)).status).toBe(401); // no password yet

    const token = links.get(email)!;
    expect(token).toBeTruthy();
    const set = await request(app).post(`${V1}/admin/auth/set-password`).send({ token, password: "helper-pass-1" });
    expect(set.status).toBe(200);
    expect(set.body).toMatchObject({ email, role: "staff" });
    expect((await login(email, "helper-pass-1")).status).toBe(200);
    // Links work once.
    expect((await request(app).post(`${V1}/admin/auth/set-password`).send({ token, password: "another-pass-1" })).status).toBe(401);
    // Duplicate emails are refused.
    expect((await request(app).post(`${V1}/admin/staff`).set(owner.h).send({ email, name: "Again" })).status).toBe(409);
  });

  it("forgot password: same reply for any email, link resets the password and signs out old sessions", async () => {
    const s = await staffSession(PREFIX, "staff");
    const unknown = await request(app).post(`${V1}/admin/auth/forgot`).send({ email: `nobody-${Date.now()}@example.com` });
    const known = await request(app).post(`${V1}/admin/auth/forgot`).send({ email: s.email });
    expect([unknown.status, known.status]).toEqual([200, 200]);
    expect(known.body).toEqual(unknown.body);

    const token = links.get(s.email)!;
    expect(token).toBeTruthy();
    // Only a hash of the token is stored.
    const { rows } = await pool.query("select token_hash from admin_tokens where admin_id = $1", [s.adminId]);
    expect(rows.map((r) => r.token_hash)).not.toContain(token);

    await request(app).post(`${V1}/admin/auth/set-password`).send({ token, password: "fresh-pass-99" }).expect(200);
    expect((await me(s.h)).status).toBe(401); // old session ended
    expect((await login(s.email, STAFF_PASSWORD)).status).toBe(401);
    expect((await login(s.email, "fresh-pass-99")).status).toBe(200);
  });

  it("rejects made-up tokens", async () => {
    const res = await request(app).post(`${V1}/admin/auth/set-password`).send({ token: "x".repeat(43), password: "whatever-123" });
    expect(res.status).toBe(401);
  });

  it("changing your password needs the current one", async () => {
    const s = await staffSession(PREFIX, "staff");
    const wrong = await request(app).put(`${V1}/admin/auth/password`).set(s.h).send({ currentPassword: "nope", password: "changed-pass-1" });
    expect(wrong.status).toBe(401);
    const ok = await request(app).put(`${V1}/admin/auth/password`).set(s.h).send({ currentPassword: STAFF_PASSWORD, password: "changed-pass-1" });
    expect(ok.status).toBe(200);
    expect((await login(s.email, "changed-pass-1")).status).toBe(200);
  });
});
