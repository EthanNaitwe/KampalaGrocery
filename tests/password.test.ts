/** Phone number + password sign-in, alongside codes. */
import { afterAll, describe, expect, it } from "vitest";
import { V1, app, captureCodes, cleanupUsers, phones, pool, request, signIn as signInWith } from "./helpers.js";

const PREFIX = "+2567997";
const nextPhone = phones(PREFIX);
const { codes, restore } = captureCodes();
const signIn = () => signInWith(codes, nextPhone());
const PW = "mango-season-24";

const login = (phoneNumber: string, password: string) =>
  request(app).post(`${V1}/auth/password/login`).send({ phoneNumber, password });

/** Codes for one number are throttled; age the earlier one so a test can ask again straight away. */
const ageCodes = (phone: string) =>
  pool.query("update otp_verifications set created_at = created_at - interval '10 minutes' where phone_number = $1", [phone]);

async function userWithPassword() {
  const u = await signIn();
  await request(app).put(`${V1}/auth/password`).set(u.h).send({ password: PW }).expect(200);
  return u;
}

afterAll(async () => {
  restore();
  await cleanupUsers(PREFIX);
  await pool.end();
});

describe("password sign-in", () => {
  it("sets a password while signed in and reports it", async () => {
    const u = await signIn();
    expect((await request(app).get(`${V1}/auth/password`).set(u.h)).body).toEqual({ hasPassword: false });
    await request(app).put(`${V1}/auth/password`).set(u.h).send({ password: PW }).expect(200);
    expect((await request(app).get(`${V1}/auth/password`).set(u.h)).body).toEqual({ hasPassword: true });
    // Stored hashed, never in plain text, and never on the user object.
    const { rows } = await pool.query("select hash from user_passwords where user_id = $1", [u.userId]);
    expect(rows[0].hash).toMatch(/^scrypt\$/);
    expect(rows[0].hash).not.toContain(PW);
    const me = await request(app).get(`${V1}/auth/me`).set(u.h);
    expect(JSON.stringify(me.body)).not.toContain("scrypt");
  });

  it("signs in with phone + password, accepting local number formats", async () => {
    const u = await userWithPassword();
    const local = "0" + u.phone.slice(4);
    const res = await login(local, PW);
    expect(res.status).toBe(200);
    expect(res.body.user.id).toBe(u.userId);
    expect(res.body.accessToken).toBeTruthy();
    expect(res.body.refreshToken).toBeTruthy();
  });

  it("gives the same answer for a wrong password, an unknown number and a number without a password", async () => {
    const u = await userWithPassword();
    const noPw = await signIn();
    const results = await Promise.all([login(u.phone, "wrong-password"), login(nextPhone(), PW), login(noPw.phone, PW)]);
    for (const r of results) {
      expect(r.status).toBe(401);
      expect(r.body.message).toBe("Wrong phone number or password");
    }
  });

  it("rejects short passwords", async () => {
    const u = await signIn();
    const res = await request(app).put(`${V1}/auth/password`).set(u.h).send({ password: "short" });
    expect(res.status).toBe(400);
  });

  it("needs the current password to change it", async () => {
    const u = await userWithPassword();
    expect((await request(app).put(`${V1}/auth/password`).set(u.h).send({ password: "new-password-1" })).status).toBe(401);
    expect((await request(app).put(`${V1}/auth/password`).set(u.h)
      .send({ currentPassword: "nope-nope", password: "new-password-1" })).status).toBe(401);
    await request(app).put(`${V1}/auth/password`).set(u.h)
      .send({ currentPassword: PW, password: "new-password-1" }).expect(200);
    expect((await login(u.phone, PW)).status).toBe(401);
    expect((await login(u.phone, "new-password-1")).status).toBe(200);
  });

  it("locks after 5 wrong tries, even for the right password, and a code unlocks it", async () => {
    const u = await userWithPassword();
    for (let i = 0; i < 5; i++) expect((await login(u.phone, "wrong-" + i)).status).toBe(401);
    const locked = await login(u.phone, PW);
    expect(locked.status).toBe(429);
    expect(locked.body.message).toMatch(/sign in with a code/);
    await ageCodes(u.phone);
    await signInWith(codes, u.phone);
    expect((await login(u.phone, PW)).status).toBe(200);
  });

  it("resets a forgotten password with a code and signs out other devices", async () => {
    const u = await userWithPassword();
    await ageCodes(u.phone);
    await request(app).post(`${V1}/auth/otp`).send({ phoneNumber: u.phone }).expect(200);
    const res = await request(app).post(`${V1}/auth/password/reset`)
      .send({ phoneNumber: u.phone, otp: codes.get(u.phone), password: "brand-new-pass" });
    expect(res.status).toBe(200);
    expect(res.body.user.id).toBe(u.userId);
    // The old device's refresh token no longer works; the new one does.
    expect((await request(app).post(`${V1}/auth/refresh`).send({ refreshToken: u.refreshToken })).status).toBe(401);
    expect((await request(app).post(`${V1}/auth/refresh`).send({ refreshToken: res.body.refreshToken })).status).toBe(200);
    expect((await login(u.phone, PW)).status).toBe(401);
    expect((await login(u.phone, "brand-new-pass")).status).toBe(200);
  });

  it("rejects a reset with a wrong code", async () => {
    const u = await userWithPassword();
    const res = await request(app).post(`${V1}/auth/password/reset`)
      .send({ phoneNumber: u.phone, otp: "000000", password: "brand-new-pass" });
    expect(res.status).toBe(401);
    expect((await login(u.phone, PW)).status).toBe(200);
  });

  it("removes the password when the account is deleted", async () => {
    const u = await userWithPassword();
    await request(app).delete(`${V1}/auth/account`).set(u.h).expect(204);
    expect((await pool.query("select 1 from user_passwords where user_id = $1", [u.userId])).rowCount).toBe(0);
    expect((await login(u.phone, PW)).status).toBe(401);
  });
});
