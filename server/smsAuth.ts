import twilio from 'twilio';
import session from "express-session";
import type { Express, RequestHandler } from "express";
import connectPg from "connect-pg-simple";
import { db } from "./db";
import { otpVerifications, users } from "@shared/schema";
import { eq, and, gt } from "drizzle-orm";
import { nanoid } from "nanoid";

// Initialize Twilio client
const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID!,
  process.env.TWILIO_AUTH_TOKEN!
);

export function getSession() {
  const sessionTtl = 7 * 24 * 60 * 60 * 1000; // 1 week
  const pgStore = connectPg(session);
  const sessionStore = new pgStore({
    conString: process.env.DATABASE_URL,
    createTableIfMissing: false,
    ttl: sessionTtl,
    tableName: "sessions",
  });
  return session({
    secret: process.env.SESSION_SECRET || "fallback-secret-key",
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      maxAge: sessionTtl,
    },
  });
}

export async function setupAuth(app: Express) {
  app.set("trust proxy", 1);
  app.use(getSession());
}

// Generate a 4-digit OTP
function generateOTP(): string {
  return Math.floor(1000 + Math.random() * 9000).toString();
}

// Send OTP via SMS
export async function sendOTP(phoneNumber: string): Promise<{ success: boolean; message: string }> {
  try {
    // Generate OTP
    const otp = generateOTP();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes from now

    // Store OTP in database
    await db.insert(otpVerifications).values({
      phoneNumber,
      otp,
      expiresAt,
      verified: false,
    });

    // Send SMS via Twilio
    await twilioClient.messages.create({
      body: `Your verification code is: ${otp}. This code will expire in 10 minutes.`,
      from: process.env.TWILIO_PHONE_NUMBER!,
      to: phoneNumber,
    });

    return { success: true, message: "OTP sent successfully" };
  } catch (error) {
    console.error("Error sending OTP:", error);
    return { success: false, message: "Failed to send OTP" };
  }
}

// Verify OTP and create user session
export async function verifyOTP(phoneNumber: string, otp: string, req: any): Promise<{ success: boolean; message: string; user?: any }> {
  try {
    // Find valid OTP
    const [otpRecord] = await db
      .select()
      .from(otpVerifications)
      .where(
        and(
          eq(otpVerifications.phoneNumber, phoneNumber),
          eq(otpVerifications.otp, otp),
          eq(otpVerifications.verified, false),
          gt(otpVerifications.expiresAt, new Date())
        )
      )
      .orderBy(otpVerifications.createdAt)
      .limit(1);

    if (!otpRecord) {
      return { success: false, message: "Invalid or expired OTP" };
    }

    // Mark OTP as verified
    await db
      .update(otpVerifications)
      .set({ verified: true })
      .where(eq(otpVerifications.id, otpRecord.id));

    // Find or create user
    let [user] = await db
      .select()
      .from(users)
      .where(eq(users.phoneNumber, phoneNumber));

    if (!user) {
      // Create new user
      const userId = nanoid();
      [user] = await db
        .insert(users)
        .values({
          id: userId,
          phoneNumber,
        })
        .returning();
    }

    // Create session
    req.session.userId = user.id;
    req.session.phoneNumber = user.phoneNumber;

    return { success: true, message: "OTP verified successfully", user };
  } catch (error) {
    console.error("Error verifying OTP:", error);
    return { success: false, message: "Failed to verify OTP" };
  }
}

// Middleware to check if user is authenticated
export const isAuthenticated: RequestHandler = async (req: any, res, next) => {
  if (!req.session.userId) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  // Get user from database
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, req.session.userId));

  if (!user) {
    return res.status(401).json({ message: "User not found" });
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