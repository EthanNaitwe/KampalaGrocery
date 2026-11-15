import { createHmac, randomInt, timingSafeEqual } from "crypto";
import { sql } from "drizzle-orm";
import { db } from "./db.js";
import { requireSecret } from "./config.js";
import { HttpError } from "./http.js";

export const OTP_LENGTH = 6;
export const OTP_TTL_MS = 10 * 60 * 1000;
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_RESEND_COOLDOWN_MS = 60 * 1000;
export const OTP_MAX_PER_IDENTIFIER_PER_HOUR = 5;
// Mobile carriers put many customers behind one public IP (carrier-grade NAT), so this is a
// coarse abuse ceiling, not a per-person limit. Per-number limits above do the real work.
export const OTP_MAX_PER_IP_PER_HOUR = Number(process.env.OTP_MAX_PER_IP_PER_HOUR) || 60;

// All time comparisons run in SQL against now(): the columns are `timestamp` without time zone,
// so passing JS Dates through raw queries would be shifted by the server's local offset.

export function generateCode(): string {
  return randomInt(0, 10 ** OTP_LENGTH).toString().padStart(OTP_LENGTH, "0");
}

function hashCode(identifier: string, code: string): string {
  return createHmac("sha256", requireSecret("OTP_SECRET")).update(`${identifier}:${code}`).digest("hex");
}

/**
 * Enforces throttles, invalidates any outstanding code for the identifier and stores a new
 * hashed code. Returns the plaintext code for delivery; it is never persisted or logged.
 */
export async function issueCode(identifier: string, ip: string | undefined): Promise<string> {
  const { rows } = await db.execute<{ since_last_ms: string | null; per_id: string; per_ip: string }>(sql`
    select
      (select extract(epoch from now() - max(created_at)) * 1000
         from otp_verifications where phone_number = ${identifier}) as since_last_ms,
      (select count(*) from otp_verifications
         where phone_number = ${identifier} and created_at > now() - interval '1 hour') as per_id,
      (select count(*) from otp_verifications
         where ip = ${ip ?? null} and created_at > now() - interval '1 hour') as per_ip`);
  const r = rows[0];

  if (r.since_last_ms !== null) {
    const waitMs = OTP_RESEND_COOLDOWN_MS - Number(r.since_last_ms);
    if (waitMs > 0) {
      throw new HttpError("RATE_LIMITED", "Please wait before requesting another code", {
        retryAfterSeconds: Math.ceil(waitMs / 1000),
      });
    }
  }
  if (Number(r.per_id) >= OTP_MAX_PER_IDENTIFIER_PER_HOUR || (ip && Number(r.per_ip) >= OTP_MAX_PER_IP_PER_HOUR)) {
    throw new HttpError("RATE_LIMITED", "Too many codes requested. Try again later.", { retryAfterSeconds: 3600 });
  }

  const code = generateCode();
  await db.transaction(async (tx) => {
    await tx.execute(sql`
      update otp_verifications set verified = true
      where phone_number = ${identifier} and verified = false`);
    await tx.execute(sql`
      insert into otp_verifications (phone_number, otp, expires_at, ip)
      values (${identifier}, ${hashCode(identifier, code)},
              now() + make_interval(secs => ${OTP_TTL_MS / 1000}), ${ip ?? null})`);
  });
  return code;
}

/**
 * Atomically spends one attempt on the newest live code, then consumes it on a match.
 * The attempt counter is incremented in the same statement that reads the hash, so
 * concurrent guesses cannot exceed OTP_MAX_ATTEMPTS.
 */
export async function verifyCode(identifier: string, code: string): Promise<boolean> {
  const { rows } = await db.execute<{ id: number; otp: string }>(sql`
    update otp_verifications set attempts = attempts + 1
    where id = (
      select id from otp_verifications
      where phone_number = ${identifier} and verified = false and expires_at > now()
      order by created_at desc limit 1
    ) and attempts < ${OTP_MAX_ATTEMPTS}
    returning id, otp`);
  const row = rows[0];
  if (!row) return false;

  const expected = Buffer.from(row.otp, "hex");
  const actual = Buffer.from(hashCode(identifier, code), "hex");
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return false;

  const consumed = await db.execute(sql`
    update otp_verifications set verified = true where id = ${row.id} and verified = false returning id`);
  return consumed.rows.length > 0;
}
