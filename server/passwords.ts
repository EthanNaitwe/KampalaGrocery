import { randomBytes, scrypt as scryptCb, timingSafeEqual, type ScryptOptions } from "crypto";
import { sql } from "drizzle-orm";
import { db } from "./db.js";
import { HttpError } from "./http.js";
import { storage } from "./storage.js";
import type { User } from "../shared/schema.js";

const scrypt = (pw: string, salt: Buffer, len: number, opts: ScryptOptions) =>
  new Promise<Buffer>((resolve, reject) => scryptCb(pw, salt, len, opts, (e, k) => (e ? reject(e) : resolve(k))));

const N = 16384, R = 8, P = 1, KEYLEN = 32;
export const MAX_FAILED_ATTEMPTS = 5;
export const LOCK_MINUTES = 15;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, KEYLEN, { N, r: R, p: P });
  return `scrypt$${N}$${R}$${P}$${salt.toString("base64")}$${key.toString("base64")}`;
}

export async function checkPassword(password: string, stored: string): Promise<boolean> {
  const [alg, n, r, p, salt, key] = stored.split("$");
  if (alg !== "scrypt" || !salt || !key) return false;
  const expected = Buffer.from(key, "base64");
  const actual = await scrypt(password, Buffer.from(salt, "base64"), expected.length, {
    N: Number(n), r: Number(r), p: Number(p),
  });
  return timingSafeEqual(actual, expected);
}

// Unknown numbers still pay for one scrypt run, so response time doesn't reveal which numbers have accounts.
let dummyHash: Promise<string> | null = null;
async function burnTime(password: string) {
  dummyHash ??= hashPassword(randomBytes(16).toString("hex"));
  await checkPassword(password, await dummyHash);
}

const invalid = (byEmail: boolean) => new HttpError("UNAUTHORIZED", byEmail ? "Wrong email or password" : "Wrong phone number or password");

type Row = { hash: string; locked_minutes: number | null };

/** Checks phone-or-email + password (identifier already normalized). Locks the account for LOCK_MINUTES after MAX_FAILED_ATTEMPTS wrong tries in a row. */
export async function loginWithPassword(identifier: string, password: string): Promise<User> {
  const byEmail = identifier.includes("@");
  const user = await (byEmail ? storage.getUserByEmail(identifier) : storage.getUserByPhone(identifier));
  let row: Row | undefined;
  if (user && !user.deletedAt) {
    const { rows } = await db.execute<Row>(sql`
      select hash,
        case when locked_until > now() then ceil(extract(epoch from locked_until - now()) / 60)::int end as locked_minutes
      from user_passwords where user_id = ${user.id}`);
    row = rows[0];
  }

  if (!user || !row) {
    await burnTime(password);
    throw invalid(byEmail);
  }
  if (row.locked_minutes) {
    throw new HttpError(
      "RATE_LIMITED",
      `Too many wrong attempts. Try again in ${row.locked_minutes} min, or sign in with a code instead.`,
    );
  }
  if (!(await checkPassword(password, row.hash))) {
    await db.execute(sql`
      update user_passwords set
        locked_until = case when failed_attempts + 1 >= ${MAX_FAILED_ATTEMPTS}
          then now() + make_interval(mins => ${LOCK_MINUTES}) else locked_until end,
        failed_attempts = case when failed_attempts + 1 >= ${MAX_FAILED_ATTEMPTS} then 0 else failed_attempts + 1 end
      where user_id = ${user.id}`);
    throw invalid(byEmail);
  }
  await clearFailures(user.id);
  return user;
}

/** A successful sign-in (password or code) clears the wrong-password counter and any lock. */
export async function clearFailures(userId: string) {
  await db.execute(sql`
    update user_passwords set failed_attempts = 0, locked_until = null
    where user_id = ${userId} and (failed_attempts > 0 or locked_until is not null)`);
}

export async function hasPassword(userId: string): Promise<boolean> {
  const { rows } = await db.execute(sql`select 1 from user_passwords where user_id = ${userId}`);
  return rows.length > 0;
}

export async function setPassword(userId: string, password: string): Promise<void> {
  const hash = await hashPassword(password);
  await db.execute(sql`
    insert into user_passwords (user_id, hash) values (${userId}, ${hash})
    on conflict (user_id) do update set hash = excluded.hash, failed_attempts = 0, locked_until = null, updated_at = now()`);
}

/** Signed-in set/change: needs the current password when one already exists. */
export async function changePassword(userId: string, password: string, currentPassword?: string): Promise<void> {
  const { rows } = await db.execute<{ hash: string }>(sql`select hash from user_passwords where user_id = ${userId}`);
  if (rows[0] && (!currentPassword || !(await checkPassword(currentPassword, rows[0].hash)))) {
    throw new HttpError("UNAUTHORIZED", "Your current password is wrong");
  }
  await setPassword(userId, password);
}
