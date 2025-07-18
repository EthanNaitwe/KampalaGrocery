import twilio from 'twilio';
import session from "express-session";
import type { Express, RequestHandler } from "express";
import { googleSheetsDb } from "./googleSheetsDb";
import { fallbackStorage } from "./fallbackStorage";
import { nanoid } from "nanoid";

// Initialize Twilio client
const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID!,
  process.env.TWILIO_AUTH_TOKEN!
);

// Custom session store for Google Sheets
class GoogleSheetsSessionStore extends session.Store {
  constructor() {
    super();
  }

  get(sid: string, callback: (err: any, session?: any) => void) {
    googleSheetsDb.getSession(sid)
      .then(session => {
        if (!session) {
          callback(null, null);
          return;
        }
        
        // Check if session has expired
        if (session.expire < new Date()) {
          this.destroy(sid, callback);
          return;
        }
        
        callback(null, session.sess);
      })
      .catch(err => {
        console.log('Using fallback storage for session get');
        fallbackStorage.getSession(sid)
          .then(session => {
            if (!session) {
              callback(null, null);
              return;
            }
            
            // Check if session has expired
            if (session.expire < new Date()) {
              this.destroy(sid, callback);
              return;
            }
            
            callback(null, session.sess);
          })
          .catch(fallbackErr => callback(fallbackErr));
      });
  }

  set(sid: string, session: any, callback?: (err?: any) => void) {
    const expire = new Date();
    expire.setTime(expire.getTime() + (7 * 24 * 60 * 60 * 1000)); // 1 week
    
    googleSheetsDb.updateSession(sid, { sid, sess: session, expire })
      .then(() => callback && callback())
      .catch(err => {
        console.log('Using fallback storage for session set');
        fallbackStorage.updateSession(sid, { sid, sess: session, expire })
          .then(() => callback && callback())
          .catch(fallbackErr => callback && callback(fallbackErr));
      });
  }

  destroy(sid: string, callback?: (err?: any) => void) {
    googleSheetsDb.deleteSession(sid)
      .then(() => callback && callback())
      .catch(err => {
        console.log('Using fallback storage for session destroy');
        fallbackStorage.deleteSession(sid)
          .then(() => callback && callback())
          .catch(fallbackErr => callback && callback(fallbackErr));
      });
  }
}

export function getSession() {
  const sessionTtl = 7 * 24 * 60 * 60 * 1000; // 1 week
  const sessionStore = new GoogleSheetsSessionStore();
  
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

    // Store OTP in Google Sheets (with fallback)
    try {
      await googleSheetsDb.createOtpVerification({
        phoneNumber,
        otp,
        expiresAt,
        verified: false,
      });
    } catch (error) {
      console.log('Using fallback storage for OTP creation');
      await fallbackStorage.createOtpVerification({
        phoneNumber,
        otp,
        expiresAt,
        verified: false,
      });
    }

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
    // Find valid OTP (with fallback)
    let otpRecord;
    try {
      otpRecord = await googleSheetsDb.getOtpVerification(phoneNumber, otp);
    } catch (error) {
      console.log('Using fallback storage for OTP verification');
      otpRecord = await fallbackStorage.getOtpVerification(phoneNumber, otp);
    }

    if (!otpRecord) {
      return { success: false, message: "Invalid or expired OTP" };
    }

    // Mark OTP as verified (with fallback)
    try {
      await googleSheetsDb.updateOtpVerification(otpRecord.id, { verified: true });
    } catch (error) {
      console.log('Using fallback storage for OTP update');
      await fallbackStorage.updateOtpVerification(otpRecord.id, { verified: true });
    }

    // Find or create user (with fallback)
    let user;
    try {
      user = await googleSheetsDb.getUserByPhone(phoneNumber);
      if (!user) {
        const userId = nanoid();
        user = await googleSheetsDb.createUser({
          id: userId,
          phoneNumber,
        });
      }
    } catch (error) {
      console.log('Using fallback storage for user operations');
      user = await fallbackStorage.getUserByPhone(phoneNumber);
      if (!user) {
        const userId = nanoid();
        user = await fallbackStorage.createUser({
          id: userId,
          phoneNumber,
        });
      }
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

  // Get user from Google Sheets
  const user = await googleSheetsDb.getUserById(req.session.userId);

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