import twilio from "twilio";

let client: ReturnType<typeof twilio> | null = null;

export const smsConfigured = () =>
  !!process.env.TWILIO_ACCOUNT_SID && !!process.env.TWILIO_AUTH_TOKEN && !!process.env.TWILIO_PHONE_NUMBER;

/**
 * Sends one SMS and returns the provider message id. Throws on provider failure.
 * The timeout is short because order texts are sent inside the request and serverless
 * functions have tight time limits.
 */
export async function sendSms(to: string, body: string, timeoutMs = 5000): Promise<string> {
  client ??= twilio(process.env.TWILIO_ACCOUNT_SID!, process.env.TWILIO_AUTH_TOKEN!);
  const send = client.messages.create({ body, from: process.env.TWILIO_PHONE_NUMBER!, to });
  const msg = await Promise.race([
    send,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`SMS timed out after ${timeoutMs}ms`)), timeoutMs)),
  ]);
  return msg.sid;
}

/** Only real phone numbers (not email identifiers) can receive SMS. */
export const isSmsRecipient = (v: string | null | undefined): v is string => !!v && /^\+\d{8,15}$/.test(v);
