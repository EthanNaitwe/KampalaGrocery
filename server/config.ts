import { randomBytes } from "crypto";

export const isProduction = process.env.NODE_ENV === "production";

const devSecrets = new Map<string, string>();

/**
 * Returns a required secret. In production a missing secret is a fatal configuration error.
 * In development a random per-process value is used (sessions/tokens reset on restart).
 */
export function requireSecret(name: "SESSION_SECRET" | "JWT_SECRET" | "OTP_SECRET"): string {
  const value = process.env[name];
  if (value && value.length >= 32) return value;
  if (isProduction) {
    throw new Error(`${name} must be set to at least 32 characters in production`);
  }
  if (!devSecrets.has(name)) {
    console.warn(`[config] ${name} not set (or < 32 chars); using a random development value.`);
    devSecrets.set(name, randomBytes(32).toString("hex"));
  }
  return devSecrets.get(name)!;
}

/** Only true when explicitly enabled outside production. Never logs codes in production. */
export const devLogOtp = !isProduction && process.env.DEV_LOG_OTP === "true";

/**
 * True inside Cloudflare Workers. There, I/O objects (like a database connection) can't be
 * shared between requests, background timers don't run, and the filesystem isn't available.
 */
export const onWorkers = (globalThis as any).navigator?.userAgent === "Cloudflare-Workers";

/** EMAIL_OTP_ENABLED=true lets customers sign up and sign in with an email code instead of SMS. */
export const emailOtpEnabled = () => process.env.EMAIL_OTP_ENABLED === "true";
