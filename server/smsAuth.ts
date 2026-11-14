import twilio from 'twilio';
import nodemailer from 'nodemailer';
import session from "express-session";
import type { Express, RequestHandler } from "express";
import connectPgSimple from "connect-pg-simple";
import { pool } from "./db.js";
import { storage } from "./storage.js";
import { sendError } from "./http.js";
import { nanoid } from "nanoid";

// Initialize Twilio client
const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID!,
  process.env.TWILIO_AUTH_TOKEN!
);

const smtpConfig = {
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT || 587),
  secure: process.env.SMTP_SECURE === 'true',
  auth: process.env.SMTP_USER && process.env.SMTP_PASS
    ? {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    }
    : undefined,
};

export const emailTransporter = nodemailer.createTransport(smtpConfig);

export function getSession() {
  const sessionTtl = 7 * 24 * 60 * 60 * 1000; // 1 week

  const sessionConfig = {
    secret: process.env.SESSION_SECRET || "fallback-secret-key-kampala-grocery-2024",
    store: new (connectPgSimple(session))({ pool: pool as any, tableName: "sessions", createTableIfMissing: false }),
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: false,
      sameSite: "lax" as "lax",
      maxAge: sessionTtl,
      path: "/",
    },
  };

  console.log('Session configuration:', {
    nodeEnv: process.env.NODE_ENV,
    secure: sessionConfig.cookie.secure,
    sameSite: sessionConfig.cookie.sameSite,
    maxAge: sessionConfig.cookie.maxAge,
    store: 'memory'
  });

  return session(sessionConfig);
}

export async function setupAuth(app: Express) {
  app.set("trust proxy", 1);
  app.use(getSession());
}

export function normalizePhoneNumber(phoneNumber: string): string {
  const cleaned = phoneNumber.trim().replace(/[\s()-]/g, "");

  if (!/^\+?[0-9]+$/.test(cleaned)) {
    throw new Error("Phone number contains invalid characters");
  }

  if (cleaned.startsWith("+")) {
    return cleaned;
  }

  if (cleaned.startsWith("256")) {
    return `+${cleaned}`;
  }

  if (cleaned.startsWith("0")) {
    return `+256${cleaned.slice(1)}`;
  }

  return `+${cleaned}`;
}

export function normalizeAuthIdentifier(identifier: string): string {
  const trimmed = identifier.trim();

  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    return trimmed.toLowerCase();
  }

  return normalizePhoneNumber(trimmed);
}

function generateOTP(): string {
  return Math.floor(1000 + Math.random() * 9000).toString();
}

export async function sendEmailOtp(email: string, otp: string) {
  const fromAddress = process.env.SMTP_FROM || process.env.SMTP_USER || 'FreshMart <no-reply@freshmart.ug>';

  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
    const message = 'SMTP email is not configured. Add SMTP_HOST, SMTP_USER, and SMTP_PASS to your .env file.';
    console.error(message);
    throw new Error(message);
  }

  try {
    await emailTransporter.sendMail({
      from: fromAddress,
      to: email,
      subject: 'Your FreshMart verification code',
      text: `Your FreshMart verification code is ${otp}. It will expire in 10 minutes.`,
      html: `<p>Your FreshMart verification code is <strong>${otp}</strong>. It will expire in 10 minutes.</p>`,
    });
  } catch (error: any) {
    const message = error?.response || error?.message || 'SMTP email delivery failed.';
    console.error('Email OTP send failed:', error);
    throw new Error(message);
  }
}

export async function sendOTP(identifier: string): Promise<{ success: boolean; message: string }> {
  try {
    const normalizedIdentifier = normalizeAuthIdentifier(identifier);
    const otp = generateOTP();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await storage.createOtpVerification({ phoneNumber: normalizedIdentifier, otp, expiresAt });

    console.log('OTP:....', otp);

    const isEmail = normalizedIdentifier.includes('@');
    const hasTwilioConfig = !!process.env.TWILIO_ACCOUNT_SID && !!process.env.TWILIO_AUTH_TOKEN && !!process.env.TWILIO_PHONE_NUMBER;

    if (isEmail) {
      await sendEmailOtp(normalizedIdentifier, otp);
      return { success: true, message: 'Verification email sent successfully' };
    }

    if (!hasTwilioConfig || process.env.NODE_ENV !== 'production') {
      console.log(`Development mode: OTP for ${normalizedIdentifier} is ${otp}`);
      return { success: true, message: 'OTP sent successfully (development mode)' };
    }

    await twilioClient.messages.create({
      body: `Your verification code is: ${otp}. This code will expire in 10 minutes.`,
      from: process.env.TWILIO_PHONE_NUMBER!,
      to: normalizedIdentifier,
    });

    return { success: true, message: 'OTP sent successfully' };
  } catch (error: any) {
    console.error('Error sending OTP:', error);
    return { success: false, message: error?.message || 'Failed to send OTP' };
  }
}

export async function verifyOTP(identifier: string, otp: string, req: any): Promise<{ success: boolean; message: string; user?: any }> {
  try {
    const normalizedIdentifier = normalizeAuthIdentifier(identifier);

    const valid = await storage.consumeOtp(normalizedIdentifier, otp);
    if (!valid) {
      return { success: false, message: 'Invalid or expired OTP' };
    }

    let user = await storage.getUserByPhone(normalizedIdentifier);
    if (!user) {
      user = await storage.upsertUser({
        id: nanoid(),
        phoneNumber: normalizedIdentifier,
        firstName: normalizedIdentifier.includes('@') ? normalizedIdentifier.split('@')[0] : undefined,
      });
    }

    req.session.userId = user.id;
    req.session.phoneNumber = user.phoneNumber;

    await new Promise<void>((resolve, reject) => {
      req.session.save((err: any) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });

    return { success: true, message: 'OTP verified successfully', user };
  } catch (error) {
    console.error('Error verifying OTP:', error);
    return { success: false, message: 'Failed to verify OTP' };
  }
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
    }),
  ]);
}

// Middleware to check if user is authenticated
export const isAuthenticated: RequestHandler = async (req: any, res, next) => {
  if (!req.session.userId) {
    return sendError(res, "UNAUTHORIZED", "Unauthorized");
  }

  let user;
  try {
    user = await withTimeout(storage.getUser(req.session.userId), 4000, 'User lookup');
  } catch (error) {
    console.error('User lookup failed:', error);
    return sendError(res, "SERVICE_UNAVAILABLE", "Service temporarily unavailable");
  }

  if (!user) {
    return sendError(res, "UNAUTHORIZED", "Unauthorized");
  }

  req.user = user;
  next();
};

// Logout function
export function logout(req: any): Promise<void> {
  return new Promise((resolve) => {
    req.session.destroy(() => {
      resolve();
    });
  });
}