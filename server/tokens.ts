import { createHash, createHmac, randomBytes, timingSafeEqual } from "crypto";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "./db.js";
import { refreshTokens } from "../shared/schema.js";
import { requireSecret } from "./config.js";
import { HttpError } from "./http.js";

export const ACCESS_TOKEN_TTL_S = 15 * 60;
export const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const b64url = (buf: Buffer | string) => Buffer.from(buf).toString("base64url");
const sha256 = (v: string) => createHash("sha256").update(v).digest("hex");

// ---- Access tokens: compact HS256 JWT -------------------------------------
export function signAccessToken(userId: string): string {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = b64url(JSON.stringify({ sub: userId, typ: "access", iat: now, exp: now + ACCESS_TOKEN_TTL_S }));
  const sig = createHmac("sha256", requireSecret("JWT_SECRET")).update(`${header}.${payload}`).digest("base64url");
  return `${header}.${payload}.${sig}`;
}

/** Returns the user id, or null if the token is malformed, forged or expired. */
export function verifyAccessToken(token: string): string | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [header, payload, sig] = parts;
  const expected = createHmac("sha256", requireSecret("JWT_SECRET")).update(`${header}.${payload}`).digest();
  const actual = Buffer.from(sig, "base64url");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  try {
    const h = JSON.parse(Buffer.from(header, "base64url").toString());
    const p = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (h.alg !== "HS256" || p.typ !== "access" || typeof p.sub !== "string") return null;
    if (typeof p.exp !== "number" || p.exp <= Math.floor(Date.now() / 1000)) return null;
    return p.sub;
  } catch {
    return null;
  }
}

// ---- Refresh tokens: opaque, hashed at rest, rotated on every use ----------
export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

async function insertRefreshToken(userId: string, familyId: string, deviceName?: string | null) {
  const refreshToken = b64url(randomBytes(32));
  await db.insert(refreshTokens).values({
    userId,
    familyId,
    deviceName: deviceName?.slice(0, 100) ?? null,
    tokenHash: sha256(refreshToken),
    expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
  });
  return refreshToken;
}

export async function issueTokens(userId: string, deviceName?: string | null): Promise<TokenPair> {
  const refreshToken = await insertRefreshToken(userId, randomBytes(16).toString("hex"), deviceName);
  return { accessToken: signAccessToken(userId), refreshToken, expiresIn: ACCESS_TOKEN_TTL_S };
}

const invalid = () => new HttpError("UNAUTHORIZED", "Session expired. Please sign in again.");

/**
 * Exchanges a refresh token for a new pair. Presenting a token that was already rotated or
 * revoked is treated as theft: the whole family (that sign-in on every device copy) is revoked.
 */
export async function rotateRefreshToken(refreshToken: string): Promise<{ userId: string; tokens: TokenPair }> {
  const [row] = await db.select().from(refreshTokens).where(eq(refreshTokens.tokenHash, sha256(refreshToken)));
  if (!row) throw invalid();

  if (row.revokedAt || row.replacedAt) {
    await revokeFamily(row.familyId);
    throw invalid();
  }
  if (row.expiresAt.getTime() <= Date.now()) throw invalid();

  // Claim the token atomically; a concurrent second use loses and is treated as reuse.
  const claimed = await db
    .update(refreshTokens)
    .set({ replacedAt: new Date() })
    .where(and(eq(refreshTokens.id, row.id), isNull(refreshTokens.replacedAt), isNull(refreshTokens.revokedAt)))
    .returning({ id: refreshTokens.id });
  if (claimed.length === 0) {
    await revokeFamily(row.familyId);
    throw invalid();
  }

  const next = await insertRefreshToken(row.userId, row.familyId, row.deviceName);
  return {
    userId: row.userId,
    tokens: { accessToken: signAccessToken(row.userId), refreshToken: next, expiresIn: ACCESS_TOKEN_TTL_S },
  };
}

export async function revokeFamily(familyId: string) {
  await db.execute(sql`update refresh_tokens set revoked_at = now() where family_id = ${familyId} and revoked_at is null`);
}

/** Signs out the device holding this token. Unknown tokens are ignored (logout is idempotent). */
export async function revokeRefreshToken(refreshToken: string) {
  const [row] = await db
    .select({ familyId: refreshTokens.familyId })
    .from(refreshTokens)
    .where(eq(refreshTokens.tokenHash, sha256(refreshToken)));
  if (row) await revokeFamily(row.familyId);
}

export async function revokeAllForUser(userId: string) {
  await db.execute(sql`update refresh_tokens set revoked_at = now() where user_id = ${userId} and revoked_at is null`);
}
