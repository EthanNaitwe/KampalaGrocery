import twilio from 'twilio';
import nodemailer from 'nodemailer';
import session from "express-session";
import type { Express, RequestHandler } from "express";
import { googleSheetsDb } from "./googleSheetsDb.js";
import { fallbackStorage } from "./fallbackStorage.js";
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
    store: new session.MemoryStore(),
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

    try {
      await googleSheetsDb.createOtpVerification({
        phoneNumber: normalizedIdentifier,
        otp,
        expiresAt,
        verified: false,
      });
    } catch (error) {
      console.log('Using fallback storage for OTP creation');
      await fallbackStorage.createOtpVerification({
        phoneNumber: normalizedIdentifier,
        otp,
        expiresAt,
        verified: false,
      });
    }

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

    let otpRecord;
    try {
      otpRecord = await googleSheetsDb.getOtpVerification(normalizedIdentifier, otp);
    } catch (error) {
      console.log('Using fallback storage for OTP verification');
      otpRecord = await fallbackStorage.getOtpVerification(normalizedIdentifier, otp);
    }

    if (!otpRecord) {
      return { success: false, message: 'Invalid or expired OTP' };
    }

    try {
      await googleSheetsDb.updateOtpVerification(otpRecord.id, { verified: true });
    } catch (error) {
      console.log('Using fallback storage for OTP update');
      await fallbackStorage.updateOtpVerification(otpRecord.id, { verified: true });
    }

    let user;
    try {
      user = await googleSheetsDb.getUserByPhone(normalizedIdentifier);
      if (!user) {
        const userId = nanoid();
        user = await googleSheetsDb.createUser({
          id: userId,
          phoneNumber: normalizedIdentifier,
          firstName: normalizedIdentifier.includes('@') ? normalizedIdentifier.split('@')[0] : undefined,
        });
      }
    } catch (error) {
      console.log('Using fallback storage for user operations');
      user = await fallbackStorage.getUserByPhone(normalizedIdentifier);
      if (!user) {
        const userId = nanoid();
        user = await fallbackStorage.createUser({
          id: userId,
          phoneNumber: normalizedIdentifier,
          firstName: normalizedIdentifier.includes('@') ? normalizedIdentifier.split('@')[0] : undefined,
        });
      }
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

    // Persist session to Google Sheets (and fallback) so session can be inspected/retrieved
    try {
      const expire = req.session.cookie?.expires ? new Date(req.session.cookie.expires) : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      await googleSheetsDb.createSession({ sid: req.sessionID, sess: req.session, expire });
    } catch (err) {
      console.log('Persisting session to Google Sheets failed, using fallback storage', err);
      try {
        await fallbackStorage.createSession({ sid: req.sessionID, sess: req.session, expire: req.session.cookie?.expires ? new Date(req.session.cookie.expires) : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) });
      } catch (fallbackErr) {
        console.error('Fallback session persistence failed:', fallbackErr);
      }
    }

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
  console.log('Session check:', {
    sessionId: req.sessionID,
    userId: req.session?.userId,
    hasSession: !!req.session,
    sessionData: req.session,
    cookies: req.headers.cookie
  });

  if (!req.session.userId) {
    console.log('No userId in session, returning 401');
    return res.status(401).json({ message: "Unauthorized" });
  }

  let user;
  try {
    user = await withTimeout(
      googleSheetsDb.getUserById(req.session.userId),
      4000,
      'Google Sheets user lookup'
    );
  } catch (error) {
    console.log('Google Sheets user lookup timed out or failed, using fallback storage for user authentication:', error);
    try {
      user = await withTimeout(
        fallbackStorage.getUserById(req.session.userId),
        2000,
        'Fallback user lookup'
      );
    } catch (fallbackError) {
      console.error('Fallback user lookup failed:', fallbackError);
      user = undefined;
    }
  }

  if (!user) {
    console.log('User not found in storage, returning 401');
    return res.status(401).json({ message: "User not found" });
  }

  console.log('User authenticated successfully:', user);
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