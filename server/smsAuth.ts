import twilio from "twilio";
import nodemailer from "nodemailer";
import session from "express-session";
import type { Express, RequestHandler } from "express";
import connectPgSimple from "connect-pg-simple";
import { nanoid } from "nanoid";
import { pool } from "./db.js";
import { storage } from "./storage.js";
import { HttpError, sendError } from "./http.js";
import { devLogOtp, isProduction, requireSecret } from "./config.js";
import { issueCode, verifyCode, OTP_TTL_MS } from "./otp.js";
import { verifyAccessToken } from "./tokens.js";
import type { User } from "../shared/schema.js";

// ---- Sessions (web) --------------------------------------------------------
export function getSession() {
  return session({
    secret: requireSecret("SESSION_SECRET"),
    store: new (connectPgSimple(session))({ pool: pool as any, tableName: "sessions", createTableIfMissing: false }),
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: isProduction,
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: "/",
    },
  });
}

export function setupAuth(app: Express) {
  app.set("trust proxy", 1);
  app.use(getSession());
}

// ---- Identifiers -----------------------------------------------------------
export function normalizePhoneNumber(phoneNumber: string): string {
  const cleaned = phoneNumber.trim().replace(/[\s()-]/g, "");
  if (!/^\+?[0-9]+$/.test(cleaned)) throw new HttpError("VALIDATION_ERROR", "Invalid phone number");
  if (cleaned.startsWith("+")) return cleaned;
  if (cleaned.startsWith("256")) return `+${cleaned}`;
  if (cleaned.startsWith("0")) return `+256${cleaned.slice(1)}`;
  return `+${cleaned}`;
}

export function normalizeAuthIdentifier(identifier: string): string {
  const trimmed = identifier.trim();
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return trimmed.toLowerCase();
  return normalizePhoneNumber(trimmed);
}

// ---- Delivery --------------------------------------------------------------
let twilioClient: ReturnType<typeof twilio> | null = null;
const hasTwilio = () =>
  !!process.env.TWILIO_ACCOUNT_SID && !!process.env.TWILIO_AUTH_TOKEN && !!process.env.TWILIO_PHONE_NUMBER;
const hasSmtp = () => !!process.env.SMTP_HOST && !!process.env.SMTP_USER && !!process.env.SMTP_PASS;

let emailTransporter: ReturnType<typeof nodemailer.createTransport> | null = null;
function getMailer() {
  emailTransporter ??= nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === "true",
    auth: { user: process.env.SMTP_USER!, pass: process.env.SMTP_PASS! },
  });
  return emailTransporter;
}

const minutes = Math.round(OTP_TTL_MS / 60000);

async function deliverCode(identifier: string, code: string) {
  const isEmail = identifier.includes("@");
  const configured = isEmail ? hasSmtp() : hasTwilio();

  if (!configured) {
    if (devLogOtp) {
      console.log(`[dev] verification code for ${identifier}: ${code}`);
      return;
    }
    // Never report success for a code nobody can receive.
    throw new HttpError(
      "SERVICE_UNAVAILABLE",
      isEmail ? "Email sign-in is temporarily unavailable" : "SMS sign-in is temporarily unavailable",
    );
  }

  try {
    if (isEmail) {
      await getMailer().sendMail({
        from: process.env.SMTP_FROM || process.env.SMTP_USER,
        to: identifier,
        subject: "Your FreshMart verification code",
        text: `Your FreshMart verification code is ${code}. It expires in ${minutes} minutes.`,
        html: `<p>Your FreshMart verification code is <strong>${code}</strong>. It expires in ${minutes} minutes.</p>`,
      });
    } else {
      twilioClient ??= twilio(process.env.TWILIO_ACCOUNT_SID!, process.env.TWILIO_AUTH_TOKEN!);
      await twilioClient.messages.create({
        body: `Your FreshMart verification code is ${code}. It expires in ${minutes} minutes.`,
        from: process.env.TWILIO_PHONE_NUMBER!,
        to: identifier,
      });
    }
  } catch (error: any) {
    // Log provider failure without the code or full provider payload.
    console.error(`Verification code delivery failed (${isEmail ? "email" : "sms"}):`, error?.code ?? error?.message);
    throw new HttpError("SERVICE_UNAVAILABLE", "Could not send the verification code. Please try again.");
  }
}

// ---- OTP flow ---------------------------------------------------------------
export async function sendOTP(identifier: string, ip: string | undefined): Promise<void> {
  const normalized = normalizeAuthIdentifier(identifier);
  const code = await issueCode(normalized, ip);
  await deliverCode(normalized, code);
}

/** Verifies the code and returns the (possibly new) user. Throws a generic error on failure. */
export async function verifyOTP(identifier: string, code: string): Promise<User> {
  const normalized = normalizeAuthIdentifier(identifier);
  if (!(await verifyCode(normalized, code))) {
    throw new HttpError("UNAUTHORIZED", "Invalid or expired code");
  }
  const existing = await storage.getUserByPhone(normalized);
  if (existing) return existing;
  return storage.upsertUser({
    id: nanoid(),
    phoneNumber: normalized,
    firstName: normalized.includes("@") ? normalized.split("@")[0] : undefined,
  });
}

/** Starts a web cookie session for the user (regenerates the session id to prevent fixation). */
export async function startWebSession(req: any, user: User): Promise<void> {
  await new Promise<void>((resolve, reject) => req.session.regenerate((err: any) => (err ? reject(err) : resolve())));
  req.session.userId = user.id;
  req.session.phoneNumber = user.phoneNumber;
  await new Promise<void>((resolve, reject) => req.session.save((err: any) => (err ? reject(err) : resolve())));
}

// ---- Middleware -------------------------------------------------------------
function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`timed out after ${timeoutMs}ms`)), timeoutMs)),
  ]);
}

/** Accepts `Authorization: Bearer <access token>` (mobile) or a cookie session (web). */
export const isAuthenticated: RequestHandler = async (req: any, res, next) => {
  const header = req.headers.authorization as string | undefined;
  let userId: string | null | undefined;

  if (header?.startsWith("Bearer ")) {
    userId = verifyAccessToken(header.slice(7).trim());
    if (!userId) return sendError(res, "UNAUTHORIZED", "Access token invalid or expired");
    req.authMethod = "token";
  } else {
    userId = req.session?.userId;
    req.authMethod = "session";
  }
  if (!userId) return sendError(res, "UNAUTHORIZED", "Unauthorized");

  let user: User | undefined;
  try {
    user = await withTimeout(storage.getUser(userId), 4000);
  } catch (error) {
    console.error("User lookup failed:", (error as Error).message);
    return sendError(res, "SERVICE_UNAVAILABLE", "Service temporarily unavailable");
  }
  if (!user || user.deletedAt) return sendError(res, "UNAUTHORIZED", "Unauthorized");

  req.user = user;
  next();
};

export function logout(req: any): Promise<void> {
  return new Promise((resolve) => {
    if (!req.session) return resolve();
    req.session.destroy(() => resolve());
  });
}
