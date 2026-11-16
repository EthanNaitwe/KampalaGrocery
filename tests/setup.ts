// Runs before any server module is imported.
import "dotenv/config";

if (!process.env.TEST_DATABASE_URL) {
  throw new Error(
    "TEST_DATABASE_URL is required for integration tests. Point it at a Neon branch, not production data.",
  );
}
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
process.env.NODE_ENV = "test";
process.env.DEV_LOG_OTP = "true";
process.env.OTP_MAX_PER_IP_PER_HOUR = "1000";
process.env.JWT_SECRET = "test-jwt-secret-test-jwt-secret-test-jwt";
process.env.OTP_SECRET = "test-otp-secret-test-otp-secret-test-otp";
process.env.SESSION_SECRET = "test-session-secret-test-session-secret";
// Force the dev delivery path so no real SMS/email is sent.
for (const k of [
  "TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_PHONE_NUMBER", "SMTP_HOST", "SMTP_USER", "SMTP_PASS",
  "BREVO_API_KEY", "AT_USERNAME", "AT_API_KEY", "AT_SENDER_ID",
]) {
  delete process.env[k];
}
